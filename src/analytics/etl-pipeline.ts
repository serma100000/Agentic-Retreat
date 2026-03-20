/**
 * ETL pipeline for transforming and loading analytics data into ClickHouse.
 *
 * Consumes events from Kafka topics, transforms them into ClickHouse-compatible
 * rows, and performs batch inserts with deduplication.
 */

import type { ClickHouseClient } from './clickhouse-client.js';
import type { ETLEvent } from './types.js';

interface KafkaConsumer {
  subscribe(topics: string[]): Promise<void>;
  run(handler: (message: { topic: string; value: string }) => Promise<void>): Promise<void>;
  disconnect(): Promise<void>;
}

interface BufferEntry {
  table: string;
  row: Record<string, unknown>;
}

const FLUSH_INTERVAL_MS = 5000;
const FLUSH_THRESHOLD = 1000;

export class ETLPipeline {
  private readonly client: ClickHouseClient;
  private readonly consumer: KafkaConsumer | null;
  private readonly buffer: BufferEntry[] = [];
  private readonly processedIds: Set<string> = new Set();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** Maximum number of processed IDs to track for dedup (ring buffer behavior) */
  private readonly maxProcessedIds = 100_000;

  constructor(client: ClickHouseClient, consumer?: KafkaConsumer | null) {
    this.client = client;
    this.consumer = consumer ?? null;
  }

  /**
   * Process an outage event, transform it, and enqueue for batch insert.
   * Idempotent: duplicate outage_ids are skipped.
   */
  async processOutageEvent(event: ETLEvent): Promise<void> {
    const data = event.data;
    const outageId = String(data['outageId'] ?? data['outage_id'] ?? '');

    if (!outageId) {
      throw new Error('Outage event missing outageId');
    }

    // Dedup check
    if (this.processedIds.has(outageId)) {
      return;
    }

    this.markProcessed(outageId);

    const row: Record<string, unknown> = {
      outage_id: outageId,
      service_id: String(data['serviceId'] ?? data['service_id'] ?? ''),
      service_slug: String(data['serviceSlug'] ?? data['service_slug'] ?? ''),
      service_name: String(data['serviceName'] ?? data['service_name'] ?? ''),
      category: String(data['category'] ?? ''),
      state: String(data['state'] ?? ''),
      confidence: Number(data['confidence'] ?? 0),
      started_at: this.toISOString(data['startedAt'] ?? data['started_at'] ?? event.timestamp),
      resolved_at: data['resolvedAt'] ?? data['resolved_at']
        ? this.toISOString(data['resolvedAt'] ?? data['resolved_at'])
        : null,
      duration_ms: Number(data['durationMs'] ?? data['duration_ms'] ?? 0),
      peak_reports_per_min: Number(data['peakReportsPerMin'] ?? data['peak_reports_per_min'] ?? 0),
      affected_regions: this.toArray(data['affectedRegions'] ?? data['affected_regions'] ?? []),
      detection_signals: this.toArray(data['detectionSignals'] ?? data['detection_signals'] ?? []),
      mttr: Number(data['mttr'] ?? 0),
      mttd: Number(data['mttd'] ?? 0),
    };

    this.enqueue('outage_events', row);
  }

  /**
   * Process a report aggregate event: aggregate reports by minute per service.
   */
  async processReportAggregate(event: ETLEvent): Promise<void> {
    const data = event.data;

    const row: Record<string, unknown> = {
      service_id: String(data['serviceId'] ?? data['service_id'] ?? ''),
      service_slug: String(data['serviceSlug'] ?? data['service_slug'] ?? ''),
      minute: this.toMinuteBucket(data['timestamp'] ?? event.timestamp),
      report_count: Number(data['reportCount'] ?? data['report_count'] ?? 1),
      unique_reporters: Number(data['uniqueReporters'] ?? data['unique_reporters'] ?? 1),
      avg_severity: Number(data['avgSeverity'] ?? data['avg_severity'] ?? 0),
      regions: this.toArray(data['regions'] ?? []),
    };

    this.enqueue('report_aggregates', row);
  }

  /**
   * Process a probe aggregate event: aggregate probes by minute per service per region.
   */
  async processProbeAggregate(event: ETLEvent): Promise<void> {
    const data = event.data;

    const row: Record<string, unknown> = {
      service_id: String(data['serviceId'] ?? data['service_id'] ?? ''),
      service_slug: String(data['serviceSlug'] ?? data['service_slug'] ?? ''),
      region: String(data['region'] ?? ''),
      minute: this.toMinuteBucket(data['timestamp'] ?? event.timestamp),
      probe_count: Number(data['probeCount'] ?? data['probe_count'] ?? 1),
      success_count: Number(data['successCount'] ?? data['success_count'] ?? 0),
      avg_latency_ms: Number(data['avgLatencyMs'] ?? data['avg_latency_ms'] ?? 0),
      p95_latency_ms: Number(data['p95LatencyMs'] ?? data['p95_latency_ms'] ?? 0),
      p99_latency_ms: Number(data['p99LatencyMs'] ?? data['p99_latency_ms'] ?? 0),
      error_count: Number(data['errorCount'] ?? data['error_count'] ?? 0),
    };

    this.enqueue('probe_aggregates', row);
  }

  /**
   * Process a social aggregate event: aggregate social signals per minute per service.
   */
  async processSocialAggregate(event: ETLEvent): Promise<void> {
    const data = event.data;

    const row: Record<string, unknown> = {
      service_id: String(data['serviceId'] ?? data['service_id'] ?? ''),
      service_slug: String(data['serviceSlug'] ?? data['service_slug'] ?? ''),
      minute: this.toMinuteBucket(data['timestamp'] ?? event.timestamp),
      mention_count: Number(data['mentionCount'] ?? data['mention_count'] ?? 1),
      complaint_count: Number(data['complaintCount'] ?? data['complaint_count'] ?? 0),
      avg_urgency: Number(data['avgUrgency'] ?? data['avg_urgency'] ?? 0),
      avg_sentiment: Number(data['avgSentiment'] ?? data['avg_sentiment'] ?? 0),
      platforms: this.toArray(data['platforms'] ?? []),
    };

    this.enqueue('social_aggregates', row);
  }

  /**
   * Start consuming from Kafka topics and processing events.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Start periodic flush timer
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);

    // Start Kafka consumer if available
    if (this.consumer) {
      await this.consumer.subscribe([
        'openpulse.outage.events',
        'openpulse.report.aggregates',
        'openpulse.probe.aggregates',
        'openpulse.social.aggregates',
      ]);

      await this.consumer.run(async (message) => {
        const event = JSON.parse(message.value) as ETLEvent;
        event.timestamp = new Date(event.timestamp);

        switch (message.topic) {
          case 'openpulse.outage.events':
            await this.processOutageEvent(event);
            break;
          case 'openpulse.report.aggregates':
            await this.processReportAggregate(event);
            break;
          case 'openpulse.probe.aggregates':
            await this.processProbeAggregate(event);
            break;
          case 'openpulse.social.aggregates':
            await this.processSocialAggregate(event);
            break;
        }
      });
    }
  }

  /**
   * Stop the ETL pipeline and flush remaining buffer.
   */
  async stop(): Promise<void> {
    this.running = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining buffered data
    await this.flush();

    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }

  /**
   * Get current buffer size.
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Get the number of processed (deduped) IDs being tracked.
   */
  getProcessedCount(): number {
    return this.processedIds.size;
  }

  /**
   * Check if the pipeline is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Force flush the current buffer.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    // Group by table
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const entry of this.buffer) {
      if (!grouped.has(entry.table)) {
        grouped.set(entry.table, []);
      }
      grouped.get(entry.table)!.push(entry.row);
    }

    // Clear buffer before inserting (to avoid re-processing on error)
    this.buffer.length = 0;

    // Batch insert per table
    const insertPromises: Promise<void>[] = [];
    for (const [table, rows] of grouped) {
      insertPromises.push(this.client.insert(table, rows));
    }

    await Promise.all(insertPromises);
  }

  // --- Private helpers ---

  private enqueue(table: string, row: Record<string, unknown>): void {
    this.buffer.push({ table, row });

    // Auto-flush when threshold reached
    if (this.buffer.length >= FLUSH_THRESHOLD) {
      void this.flush();
    }
  }

  private markProcessed(id: string): void {
    // Evict old entries if exceeding max capacity
    if (this.processedIds.size >= this.maxProcessedIds) {
      const first = this.processedIds.values().next().value;
      if (first !== undefined) {
        this.processedIds.delete(first);
      }
    }
    this.processedIds.add(id);
  }

  private toISOString(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return new Date(value).toISOString();
    if (typeof value === 'number') return new Date(value).toISOString();
    return new Date().toISOString();
  }

  private toMinuteBucket(value: unknown): string {
    const date = value instanceof Date ? value : new Date(String(value));
    date.setSeconds(0, 0);
    return date.toISOString();
  }

  private toArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') return [value];
    return [];
  }
}
