/**
 * Custom service monitoring for enterprise orgs.
 * Validates configuration, enforces plan limits, and tracks monitor status.
 */

import { randomBytes } from 'node:crypto';
import type {
  AlertPolicy,
  CustomMonitor,
  Organization,
  ProbeType,
} from '../types.js';

// ── Types ───────────────────────────────────────────────────────

export interface MonitorStatus {
  status: 'up' | 'down' | 'degraded' | 'unknown';
  lastCheck: Date | null;
  latency: number | null;   // ms
  uptime24h: number | null;  // percentage
}

export interface MonitorCreateInput {
  name: string;
  url: string;
  probeTypes?: ProbeType[];
  interval?: number;
  regions?: string[];
  alertPolicy?: Partial<AlertPolicy>;
}

// ── Helpers ─────────────────────────────────────────────────────

function generateId(): string {
  return randomBytes(12).toString('hex');
}

const VALID_PROBE_TYPES: ProbeType[] = ['http', 'tcp', 'ping', 'dns', 'tls'];
const MIN_INTERVAL = 30;   // seconds
const DEFAULT_INTERVAL = 60;
const DEFAULT_REGIONS = ['us-east-1', 'eu-west-1'];
const URL_PATTERN = /^https?:\/\/.+/;

// ── CustomMonitorService ────────────────────────────────────────

export class CustomMonitorService {
  private monitors = new Map<string, CustomMonitor>();
  private statuses = new Map<string, MonitorStatus>();

  /** Injected org lookup to enforce plan limits. */
  private readonly getOrg: (orgId: string) => Organization | null;
  private readonly getMonitorCountForOrg: (orgId: string) => number;

  constructor(opts?: {
    getOrg?: (orgId: string) => Organization | null;
    getMonitorCountForOrg?: (orgId: string) => number;
  }) {
    this.getOrg = opts?.getOrg ?? (() => null);
    this.getMonitorCountForOrg =
      opts?.getMonitorCountForOrg ??
      ((orgId: string) =>
        [...this.monitors.values()].filter((m) => m.orgId === orgId).length);
  }

  // ── Create ────────────────────────────────────────────────

  createMonitor(orgId: string, config: MonitorCreateInput): CustomMonitor {
    // Validate required fields
    if (!config.name?.trim()) {
      throw new Error('Monitor name is required');
    }
    if (!config.url || !URL_PATTERN.test(config.url)) {
      throw new Error(
        'A valid HTTP/HTTPS URL is required',
      );
    }

    // Validate probe types
    const probeTypes = config.probeTypes ?? ['http'];
    for (const pt of probeTypes) {
      if (!VALID_PROBE_TYPES.includes(pt)) {
        throw new Error(`Invalid probe type: ${pt}`);
      }
    }

    // Validate interval
    const interval = config.interval ?? DEFAULT_INTERVAL;
    if (interval < MIN_INTERVAL) {
      throw new Error(
        `Minimum check interval is ${MIN_INTERVAL} seconds`,
      );
    }

    // Check org plan limits
    const org = this.getOrg(orgId);
    if (org) {
      const currentCount = this.getMonitorCountForOrg(orgId);
      if (currentCount >= org.maxMonitors) {
        throw new Error(
          `Monitor limit reached for ${org.plan} plan (max ${org.maxMonitors})`,
        );
      }
    }

    const alertPolicy: AlertPolicy = {
      channels: config.alertPolicy?.channels ?? ['email'],
      threshold: config.alertPolicy?.threshold ?? 3,
      cooldownMinutes: config.alertPolicy?.cooldownMinutes ?? 15,
    };

    const monitor: CustomMonitor = {
      id: generateId(),
      orgId,
      name: config.name.trim(),
      url: config.url,
      probeTypes,
      interval,
      regions: config.regions ?? DEFAULT_REGIONS,
      alertPolicy,
      createdAt: new Date(),
    };

    this.monitors.set(monitor.id, monitor);
    this.statuses.set(monitor.id, {
      status: 'unknown',
      lastCheck: null,
      latency: null,
      uptime24h: null,
    });

    return monitor;
  }

  // ── Update ────────────────────────────────────────────────

  updateMonitor(
    monitorId: string,
    updates: Partial<MonitorCreateInput>,
  ): CustomMonitor {
    const monitor = this.monitors.get(monitorId);
    if (!monitor) {
      throw new Error(`Monitor not found: ${monitorId}`);
    }

    if (updates.name !== undefined) {
      if (!updates.name.trim()) {
        throw new Error('Monitor name is required');
      }
      monitor.name = updates.name.trim();
    }

    if (updates.url !== undefined) {
      if (!URL_PATTERN.test(updates.url)) {
        throw new Error('A valid HTTP/HTTPS URL is required');
      }
      monitor.url = updates.url;
    }

    if (updates.probeTypes !== undefined) {
      for (const pt of updates.probeTypes) {
        if (!VALID_PROBE_TYPES.includes(pt)) {
          throw new Error(`Invalid probe type: ${pt}`);
        }
      }
      monitor.probeTypes = updates.probeTypes;
    }

    if (updates.interval !== undefined) {
      if (updates.interval < MIN_INTERVAL) {
        throw new Error(`Minimum check interval is ${MIN_INTERVAL} seconds`);
      }
      monitor.interval = updates.interval;
    }

    if (updates.regions !== undefined) {
      monitor.regions = updates.regions;
    }

    if (updates.alertPolicy !== undefined) {
      monitor.alertPolicy = {
        ...monitor.alertPolicy,
        ...updates.alertPolicy,
      };
    }

    return monitor;
  }

  // ── Delete ────────────────────────────────────────────────

  deleteMonitor(monitorId: string): boolean {
    const existed = this.monitors.delete(monitorId);
    this.statuses.delete(monitorId);
    return existed;
  }

  // ── List ──────────────────────────────────────────────────

  listMonitors(orgId: string): CustomMonitor[] {
    return [...this.monitors.values()].filter((m) => m.orgId === orgId);
  }

  // ── Status ────────────────────────────────────────────────

  getMonitorStatus(monitorId: string): MonitorStatus {
    const status = this.statuses.get(monitorId);
    if (!status) {
      throw new Error(`Monitor not found: ${monitorId}`);
    }
    return { ...status };
  }

  /**
   * Record a check result (called by the monitoring engine).
   * Exposed for testing and integration.
   */
  recordCheckResult(
    monitorId: string,
    result: { up: boolean; latencyMs: number },
  ): void {
    const status = this.statuses.get(monitorId);
    if (!status) return;

    status.lastCheck = new Date();
    status.latency = result.latencyMs;
    status.status = result.up ? 'up' : 'down';

    // Simplified 24h uptime tracking (production would use time-series data)
    if (status.uptime24h === null) {
      status.uptime24h = result.up ? 100 : 0;
    } else {
      // Exponential moving average approximation
      const weight = 0.05;
      const sample = result.up ? 100 : 0;
      status.uptime24h = status.uptime24h * (1 - weight) + sample * weight;
    }
  }
}
