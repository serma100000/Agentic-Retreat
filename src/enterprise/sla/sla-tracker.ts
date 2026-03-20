/**
 * SLA tracking and compliance reporting.
 *
 * Uptime = (total_time - downtime) / total_time * 100
 */

import { randomBytes } from 'node:crypto';
import type {
  MeasurementWindow,
  SLAReport,
  SLATarget,
  SLAViolation,
} from '../types.js';

// ── Types ───────────────────────────────────────────────────────

interface OutageRecord {
  serviceId: string;
  startedAt: Date;
  resolvedAt: Date;
  impactLevel: 'minor' | 'major' | 'critical';
}

interface CurrentSLAStatus {
  met: boolean;
  currentUptime: number;
  remainingDowntimeBudgetMs: number;
  violations: SLAViolation[];
}

// ── Helpers ─────────────────────────────────────────────────────

function generateId(): string {
  return randomBytes(12).toString('hex');
}

function getWindowDurationMs(window: MeasurementWindow): number {
  switch (window) {
    case 'monthly':
      return 30 * 24 * 60 * 60 * 1000;
    case 'quarterly':
      return 90 * 24 * 60 * 60 * 1000;
    case 'yearly':
      return 365 * 24 * 60 * 60 * 1000;
  }
}

function getWindowStart(window: MeasurementWindow, now: Date): Date {
  const start = new Date(now);
  switch (window) {
    case 'monthly':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'quarterly': {
      const q = Math.floor(start.getMonth() / 3) * 3;
      start.setMonth(q, 1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'yearly':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
  }
  return start;
}

// ── SLATracker ──────────────────────────────────────────────────

export class SLATracker {
  private targets = new Map<string, SLATarget>();
  private outages: OutageRecord[] = [];

  // ── SLA Targets ─────────────────────────────────────────────

  createSLATarget(
    orgId: string,
    serviceId: string,
    target: Partial<SLATarget>,
  ): SLATarget {
    const uptimeTarget = target.uptimeTarget ?? 99.9;
    if (uptimeTarget < 0 || uptimeTarget > 100) {
      throw new Error('Uptime target must be between 0 and 100');
    }

    const sla: SLATarget = {
      id: generateId(),
      orgId,
      serviceId,
      uptimeTarget,
      responseTimeTarget: target.responseTimeTarget ?? 500,
      measurementWindow: target.measurementWindow ?? 'monthly',
    };

    this.targets.set(sla.id, sla);
    return sla;
  }

  getSLATarget(slaId: string): SLATarget | null {
    return this.targets.get(slaId) ?? null;
  }

  listSLATargets(orgId: string): SLATarget[] {
    return [...this.targets.values()].filter((t) => t.orgId === orgId);
  }

  // ── Outage management (for testing / integration) ───────────

  recordOutage(outage: OutageRecord): void {
    this.outages.push(outage);
  }

  // ── Report generation ───────────────────────────────────────

  generateReport(
    slaId: string,
    period: { start: Date; end: Date },
  ): SLAReport {
    const target = this.targets.get(slaId);
    if (!target) {
      throw new Error(`SLA target not found: ${slaId}`);
    }

    const totalMs = period.end.getTime() - period.start.getTime();
    if (totalMs <= 0) {
      throw new Error('Period end must be after start');
    }

    const violations = this.findViolations(
      target.serviceId,
      period.start,
      period.end,
    );

    const downtimeMs = violations.reduce((sum, v) => sum + v.duration, 0);
    const actualUptime = ((totalMs - downtimeMs) / totalMs) * 100;

    return {
      slaId,
      period,
      actualUptime: Math.round(actualUptime * 10000) / 10000, // 4 decimal precision
      targetUptime: target.uptimeTarget,
      met: actualUptime >= target.uptimeTarget,
      violations,
      generatedAt: new Date(),
    };
  }

  // ── Current status ──────────────────────────────────────────

  getCurrentStatus(slaId: string): CurrentSLAStatus {
    const target = this.targets.get(slaId);
    if (!target) {
      throw new Error(`SLA target not found: ${slaId}`);
    }

    const now = new Date();
    const windowStart = getWindowStart(target.measurementWindow, now);
    const windowDurationMs = getWindowDurationMs(target.measurementWindow);
    const elapsedMs = now.getTime() - windowStart.getTime();

    const violations = this.findViolations(target.serviceId, windowStart, now);
    const downtimeMs = violations.reduce((sum, v) => sum + v.duration, 0);

    const currentUptime =
      elapsedMs > 0
        ? ((elapsedMs - downtimeMs) / elapsedMs) * 100
        : 100;

    // Remaining budget: how much downtime is still allowed this window
    const maxDowntimeMs =
      windowDurationMs * ((100 - target.uptimeTarget) / 100);
    const remainingBudget = Math.max(0, maxDowntimeMs - downtimeMs);

    return {
      met: currentUptime >= target.uptimeTarget,
      currentUptime: Math.round(currentUptime * 10000) / 10000,
      remainingDowntimeBudgetMs: Math.round(remainingBudget),
      violations,
    };
  }

  // ── Compliance history ──────────────────────────────────────

  getComplianceHistory(slaId: string, periods: number): SLAReport[] {
    const target = this.targets.get(slaId);
    if (!target) {
      throw new Error(`SLA target not found: ${slaId}`);
    }

    const reports: SLAReport[] = [];
    const now = new Date();

    for (let i = 0; i < periods; i++) {
      const { start, end } = this.getPeriodBounds(
        target.measurementWindow,
        now,
        i,
      );
      reports.push(this.generateReport(slaId, { start, end }));
    }

    return reports;
  }

  // ── Private helpers ─────────────────────────────────────────

  private findViolations(
    serviceId: string,
    start: Date,
    end: Date,
  ): SLAViolation[] {
    return this.outages
      .filter((o) => {
        if (o.serviceId !== serviceId) return false;
        // Overlap check
        return o.startedAt < end && o.resolvedAt > start;
      })
      .map((o) => {
        const effectiveStart = o.startedAt < start ? start : o.startedAt;
        const effectiveEnd = o.resolvedAt > end ? end : o.resolvedAt;
        const duration = effectiveEnd.getTime() - effectiveStart.getTime();

        return {
          startedAt: effectiveStart,
          resolvedAt: effectiveEnd,
          duration,
          impactLevel: o.impactLevel,
        };
      });
  }

  private getPeriodBounds(
    window: MeasurementWindow,
    now: Date,
    periodsAgo: number,
  ): { start: Date; end: Date } {
    const end = new Date(now);
    const start = new Date(now);

    switch (window) {
      case 'monthly':
        end.setMonth(end.getMonth() - periodsAgo, 1);
        end.setHours(0, 0, 0, 0);
        start.setTime(end.getTime());
        start.setMonth(start.getMonth() - 1);
        break;
      case 'quarterly':
        end.setMonth(end.getMonth() - periodsAgo * 3, 1);
        end.setHours(0, 0, 0, 0);
        start.setTime(end.getTime());
        start.setMonth(start.getMonth() - 3);
        break;
      case 'yearly':
        end.setFullYear(end.getFullYear() - periodsAgo, 0, 1);
        end.setHours(0, 0, 0, 0);
        start.setTime(end.getTime());
        start.setFullYear(start.getFullYear() - 1);
        break;
    }

    // Swap if periodsAgo=0 means current (start < end)
    if (start > end) {
      return { start: end, end: start };
    }
    return { start, end };
  }
}
