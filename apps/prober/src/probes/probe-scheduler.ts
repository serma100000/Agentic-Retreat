/**
 * Probe scheduler.
 *
 * Manages a queue of services to probe with staggered execution,
 * concurrency limiting, adaptive frequency during outages, and
 * Kafka result publishing.
 */

import type { Kafka, Producer } from 'kafkajs';
import type { Redis } from 'ioredis';
import pino from 'pino';
import type { ProbeConfig, ProbeResult, ProbeTypeValue } from './types.js';
import { httpProbe } from './http-probe.js';
import { dnsProbe } from './dns-probe.js';
import { tcpProbe } from './tcp-probe.js';
import type { ProberConfig } from '../config.js';

const logger = pino({ name: 'probe-scheduler' });

interface ScheduledProbe {
  config: ProbeConfig;
  nextRunAt: number;
  timerId?: ReturnType<typeof setTimeout>;
}

export class ProbeScheduler {
  private readonly probes = new Map<string, ScheduledProbe>();
  private readonly activeProbes = new Set<string>();
  private producer: Producer | null = null;
  private running = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly kafka: Kafka,
    private readonly redis: Redis,
    private readonly proberConfig: ProberConfig,
  ) {}

  async start(): Promise<void> {
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
    await this.producer.connect();
    this.running = true;

    // Tick every second to check for due probes
    this.tickTimer = setInterval(() => {
      void this.tick();
    }, 1000);

    logger.info(
      { probeCount: this.probes.size, concurrency: this.proberConfig.concurrency },
      'Probe scheduler started',
    );
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    // Cancel all scheduled timers
    for (const scheduled of this.probes.values()) {
      if (scheduled.timerId) {
        clearTimeout(scheduled.timerId);
      }
    }

    // Wait for active probes to finish (with a 5s timeout)
    const deadline = Date.now() + 5000;
    while (this.activeProbes.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }

    logger.info('Probe scheduler stopped');
  }

  /**
   * Register probes from the service catalog.
   * Staggers initial execution times across the probe interval
   * to avoid thundering herd.
   */
  registerProbes(configs: ProbeConfig[]): void {
    const intervalMs = this.proberConfig.probeIntervalMs;
    const staggerStep = configs.length > 0 ? intervalMs / configs.length : 0;

    for (let i = 0; i < configs.length; i++) {
      const config = configs[i]!;
      const stagger = Math.round(staggerStep * i);
      const nextRunAt = Date.now() + stagger;

      this.probes.set(config.service_id, {
        config,
        nextRunAt,
      });
    }

    logger.info(
      { count: configs.length, staggerMs: Math.round(staggerStep) },
      'Registered probes with staggered schedule',
    );
  }

  /**
   * Clear all registered probes.
   */
  clearProbes(): void {
    for (const scheduled of this.probes.values()) {
      if (scheduled.timerId) {
        clearTimeout(scheduled.timerId);
      }
    }
    this.probes.clear();
  }

  /**
   * Get the count of currently registered probes.
   */
  get probeCount(): number {
    return this.probes.size;
  }

  /**
   * Get the count of actively running probes.
   */
  get activeCount(): number {
    return this.activeProbes.size;
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    const now = Date.now();
    const dueProbes: ProbeConfig[] = [];

    for (const [serviceId, scheduled] of this.probes) {
      if (
        scheduled.nextRunAt <= now &&
        !this.activeProbes.has(serviceId) &&
        this.activeProbes.size + dueProbes.length < this.proberConfig.concurrency
      ) {
        dueProbes.push(scheduled.config);
      }
    }

    // Execute due probes
    for (const config of dueProbes) {
      void this.executeProbe(config);
    }
  }

  private async executeProbe(config: ProbeConfig): Promise<void> {
    this.activeProbes.add(config.service_id);

    try {
      const result = await this.runProbe(config);
      await this.publishResult(result);

      // Schedule next run with adaptive frequency
      const intervalMs = await this.getAdaptiveInterval(config.service_id, config.interval_ms);
      const scheduled = this.probes.get(config.service_id);
      if (scheduled) {
        scheduled.nextRunAt = Date.now() + intervalMs;
      }

      logger.debug(
        {
          service_id: config.service_id,
          success: result.success,
          latency_ms: result.latency_ms,
          next_in_ms: intervalMs,
        },
        'Probe completed',
      );
    } catch (err) {
      logger.error(
        { service_id: config.service_id, error: err instanceof Error ? err.message : String(err) },
        'Probe execution failed unexpectedly',
      );

      // Reschedule even on unexpected error
      const scheduled = this.probes.get(config.service_id);
      if (scheduled) {
        scheduled.nextRunAt = Date.now() + config.interval_ms;
      }
    } finally {
      this.activeProbes.delete(config.service_id);
    }
  }

  private async runProbe(config: ProbeConfig): Promise<ProbeResult> {
    const probeExecutors: Record<
      ProbeTypeValue,
      (config: ProbeConfig, region: string) => Promise<ProbeResult>
    > = {
      http: httpProbe,
      https: httpProbe,
      tcp: tcpProbe,
      dns: dnsProbe,
    };

    const executor = probeExecutors[config.probe_type];
    if (!executor) {
      throw new Error(`Unsupported probe type: ${config.probe_type}`);
    }

    return executor(config, this.proberConfig.region);
  }

  /**
   * Check Redis for suspected outage flag and return adaptive interval.
   * During suspected outages, probe frequency increases to 10s.
   */
  private async getAdaptiveInterval(serviceId: string, defaultMs: number): Promise<number> {
    try {
      const outageKey = `${this.proberConfig.redisOutagePrefix}${serviceId}`;
      const flag = await this.redis.get(outageKey);

      if (flag === '1' || flag === 'true') {
        return this.proberConfig.outageIntervalMs;
      }
    } catch (err) {
      logger.warn(
        { service_id: serviceId, error: err instanceof Error ? err.message : String(err) },
        'Failed to check outage flag in Redis, using default interval',
      );
    }

    return defaultMs;
  }

  /**
   * Publish a probe result to Kafka.
   */
  private async publishResult(result: ProbeResult): Promise<void> {
    if (!this.producer) {
      logger.warn('Kafka producer not connected, dropping probe result');
      return;
    }

    try {
      await this.producer.send({
        topic: this.proberConfig.kafkaTopic,
        messages: [
          {
            key: result.service_id,
            value: JSON.stringify(result),
            timestamp: result.timestamp.getTime().toString(),
            headers: {
              probe_type: result.probe_type,
              region: result.region,
              success: result.success ? '1' : '0',
            },
          },
        ],
      });
    } catch (err) {
      logger.error(
        { service_id: result.service_id, error: err instanceof Error ? err.message : String(err) },
        'Failed to publish probe result to Kafka',
      );
    }
  }
}
