import { describe, it, expect, beforeEach } from 'vitest';
import { SLATracker } from '../sla/sla-tracker.js';

// ── Helpers ─────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}

function hoursAfter(base: Date, h: number): Date {
  return new Date(base.getTime() + h * HOUR_MS);
}

describe('SLATracker', () => {
  let tracker: SLATracker;

  beforeEach(() => {
    tracker = new SLATracker();
  });

  // ── SLA target creation ─────────────────────────────────────

  it('creates an SLA target with defaults', () => {
    const sla = tracker.createSLATarget('org-1', 'svc-api', {});
    expect(sla.id).toBeDefined();
    expect(sla.orgId).toBe('org-1');
    expect(sla.serviceId).toBe('svc-api');
    expect(sla.uptimeTarget).toBe(99.9);
    expect(sla.responseTimeTarget).toBe(500);
    expect(sla.measurementWindow).toBe('monthly');
  });

  it('creates an SLA target with custom values', () => {
    const sla = tracker.createSLATarget('org-1', 'svc-api', {
      uptimeTarget: 99.99,
      responseTimeTarget: 200,
      measurementWindow: 'quarterly',
    });
    expect(sla.uptimeTarget).toBe(99.99);
    expect(sla.responseTimeTarget).toBe(200);
    expect(sla.measurementWindow).toBe('quarterly');
  });

  it('rejects invalid uptime targets', () => {
    expect(() =>
      tracker.createSLATarget('org-1', 'svc', { uptimeTarget: 101 }),
    ).toThrow('between 0 and 100');
    expect(() =>
      tracker.createSLATarget('org-1', 'svc', { uptimeTarget: -1 }),
    ).toThrow('between 0 and 100');
  });

  // ── Report: no outages ──────────────────────────────────────

  it('reports 100% uptime and met=true when no outages', () => {
    const sla = tracker.createSLATarget('org-1', 'svc-api', {
      uptimeTarget: 99.9,
    });
    const start = daysAgo(30);
    const end = new Date();
    const report = tracker.generateReport(sla.id, { start, end });

    expect(report.actualUptime).toBe(100);
    expect(report.met).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  // ── Report: single outage ──────────────────────────────────

  it('calculates uptime correctly with a 1-hour outage in 30 days', () => {
    const sla = tracker.createSLATarget('org-1', 'svc-api', {
      uptimeTarget: 99.9,
    });

    const start = daysAgo(30);
    const end = new Date();
    const outageStart = daysAgo(15);

    tracker.recordOutage({
      serviceId: 'svc-api',
      startedAt: outageStart,
      resolvedAt: hoursAfter(outageStart, 1),
      impactLevel: 'major',
    });

    const report = tracker.generateReport(sla.id, { start, end });

    // 1 hour out of ~720 hours = ~99.86%
    const totalMs = end.getTime() - start.getTime();
    const expectedUptime = ((totalMs - HOUR_MS) / totalMs) * 100;
    expect(report.actualUptime).toBeCloseTo(expectedUptime, 2);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]!.impactLevel).toBe('major');
    expect(report.violations[0]!.duration).toBe(HOUR_MS);
  });

  // ── Report: multiple violations ─────────────────────────────

  it('identifies multiple violations in a period', () => {
    const sla = tracker.createSLATarget('org-1', 'svc-api', {
      uptimeTarget: 99.99,
    });

    const start = daysAgo(30);
    const end = new Date();

    tracker.recordOutage({
      serviceId: 'svc-api',
      startedAt: daysAgo(20),
      resolvedAt: hoursAfter(daysAgo(20), 2),
      impactLevel: 'critical',
    });
    tracker.recordOutage({
      serviceId: 'svc-api',
      startedAt: daysAgo(10),
      resolvedAt: hoursAfter(daysAgo(10), 0.5),
      impactLevel: 'minor',
    });
    tracker.recordOutage({
      serviceId: 'svc-api',
      startedAt: daysAgo(5),
      resolvedAt: hoursAfter(daysAgo(5), 1),
      impactLevel: 'major',
    });

    const report = tracker.generateReport(sla.id, { start, end });
    expect(report.violations).toHaveLength(3);
    expect(report.met).toBe(false); // 3.5 hours of downtime exceeds 99.99% on 30 days
  });

  // ── Report: outage partially outside window ─────────────────

  it('clips outages to the measurement window boundaries', () => {
    const sla = tracker.createSLATarget('org-1', 'svc-api', {
      uptimeTarget: 99.9,
    });

    const start = daysAgo(30);
    const end = new Date();

    // Outage that started before the window
    tracker.recordOutage({
      serviceId: 'svc-api',
      startedAt: daysAgo(35),
      resolvedAt: hoursAfter(daysAgo(30), 2), // 2 hours into the window
      impactLevel: 'critical',
    });

    const report = tracker.generateReport(sla.id, { start, end });
    expect(report.violations).toHaveLength(1);
    // Duration should be clipped to ~2 hours (from window start to resolvedAt)
    const violation = report.violations[0]!;
    expect(violation.duration).toBeLessThanOrEqual(2 * HOUR_MS + 1000); // small tolerance
    expect(violation.duration).toBeGreaterThan(0);
  });

  // ── Report: ignores other services ──────────────────────────

  it('ignores outages for different services', () => {
    const sla = tracker.createSLATarget('org-1', 'svc-api', {
      uptimeTarget: 99.9,
    });

    tracker.recordOutage({
      serviceId: 'svc-web', // different service
      startedAt: daysAgo(5),
      resolvedAt: hoursAfter(daysAgo(5), 10),
      impactLevel: 'critical',
    });

    const report = tracker.generateReport(sla.id, {
      start: daysAgo(30),
      end: new Date(),
    });
    expect(report.violations).toHaveLength(0);
    expect(report.actualUptime).toBe(100);
  });

  // ── Current status ──────────────────────────────────────────

  it('shows current status with remaining downtime budget', () => {
    const sla = tracker.createSLATarget('org-1', 'svc-api', {
      uptimeTarget: 99.9,
      measurementWindow: 'monthly',
    });

    const status = tracker.getCurrentStatus(sla.id);
    expect(status.met).toBe(true);
    expect(status.currentUptime).toBe(100);
    // Budget for 99.9% over 30 days = 0.1% * 30*24*60*60*1000 = ~2,592,000 ms (~43 min)
    expect(status.remainingDowntimeBudgetMs).toBeGreaterThan(0);
    expect(status.violations).toHaveLength(0);
  });

  it('reduces remaining budget after outages', () => {
    const sla = tracker.createSLATarget('org-1', 'svc-api', {
      uptimeTarget: 99.9,
      measurementWindow: 'monthly',
    });

    // Record a 30-minute outage today
    const now = new Date();
    tracker.recordOutage({
      serviceId: 'svc-api',
      startedAt: new Date(now.getTime() - 30 * 60 * 1000),
      resolvedAt: now,
      impactLevel: 'minor',
    });

    const status = tracker.getCurrentStatus(sla.id);
    expect(status.currentUptime).toBeLessThan(100);
    expect(status.violations).toHaveLength(1);
  });

  // ── Listing ─────────────────────────────────────────────────

  it('lists SLA targets for an organization', () => {
    tracker.createSLATarget('org-1', 'svc-api', {});
    tracker.createSLATarget('org-1', 'svc-web', {});
    tracker.createSLATarget('org-2', 'svc-db', {});

    const org1 = tracker.listSLATargets('org-1');
    expect(org1).toHaveLength(2);
    expect(org1.map((s) => s.serviceId).sort()).toEqual(['svc-api', 'svc-web']);

    const org2 = tracker.listSLATargets('org-2');
    expect(org2).toHaveLength(1);
  });

  // ── Compliance history ──────────────────────────────────────

  it('generates compliance history for multiple periods', () => {
    const sla = tracker.createSLATarget('org-1', 'svc-api', {
      uptimeTarget: 99.9,
      measurementWindow: 'monthly',
    });

    const reports = tracker.getComplianceHistory(sla.id, 3);
    expect(reports).toHaveLength(3);
    for (const r of reports) {
      expect(r.slaId).toBe(sla.id);
      expect(r.targetUptime).toBe(99.9);
    }
  });

  // ── Error handling ──────────────────────────────────────────

  it('throws for non-existent SLA target in generateReport', () => {
    expect(() =>
      tracker.generateReport('nonexistent', {
        start: daysAgo(30),
        end: new Date(),
      }),
    ).toThrow('SLA target not found');
  });

  it('throws for invalid period (end before start)', () => {
    const sla = tracker.createSLATarget('org-1', 'svc-api', {});
    expect(() =>
      tracker.generateReport(sla.id, {
        start: new Date(),
        end: daysAgo(30),
      }),
    ).toThrow('Period end must be after start');
  });
});
