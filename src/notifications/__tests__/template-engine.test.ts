import { describe, expect, it } from 'vitest';
import { TemplateEngine } from '../template-engine.js';
import { NotificationPriority } from '../types.js';
import type { NotificationPayload } from '../types.js';

function makePayload(
  overrides: Partial<NotificationPayload> = {},
): NotificationPayload {
  return {
    id: 'notif-001',
    serviceId: 'svc-github',
    serviceSlug: 'github',
    serviceName: 'GitHub',
    outageState: 'MAJOR_OUTAGE',
    previousState: 'OPERATIONAL',
    confidence: 0.92,
    affectedRegions: ['US East', 'EU West'],
    timestamp: new Date('2026-03-20T14:30:00Z'),
    message: 'Multiple users reporting 500 errors on API.',
    ...overrides,
  };
}

describe('TemplateEngine', () => {
  const engine = new TemplateEngine();

  describe('renderOutageNotification', () => {
    it('renders correct subject line with service name and state', () => {
      const template = engine.renderOutageNotification(makePayload());
      expect(template.subject).toBe('[OpenPulse] GitHub - MAJOR_OUTAGE');
    });

    it('includes confidence, regions, and time in body', () => {
      const template = engine.renderOutageNotification(makePayload());
      expect(template.body).toContain('Confidence: 92%');
      expect(template.body).toContain('US East, EU West');
      expect(template.body).toContain('2026-03-20');
    });

    it('includes previous state in body', () => {
      const template = engine.renderOutageNotification(makePayload());
      expect(template.body).toContain('was OPERATIONAL');
    });

    it('renders markdown for Slack/Discord', () => {
      const template = engine.renderOutageNotification(makePayload());
      expect(template.markdown).toContain('**GitHub**');
      expect(template.markdown).toContain('**MAJOR_OUTAGE**');
    });
  });

  describe('renderRecoveryNotification', () => {
    it('renders subject with Recovered', () => {
      const template = engine.renderRecoveryNotification(
        makePayload({ outageState: 'RESOLVED', previousState: 'MAJOR_OUTAGE' }),
      );
      expect(template.subject).toBe('[OpenPulse] GitHub - Recovered');
    });

    it('includes previous state in body', () => {
      const template = engine.renderRecoveryNotification(
        makePayload({ previousState: 'DEGRADED' }),
      );
      expect(template.body).toContain('Previous State: DEGRADED');
    });

    it('renders markdown with recovery indicator', () => {
      const template = engine.renderRecoveryNotification(makePayload());
      expect(template.markdown).toContain('**recovered**');
    });
  });

  describe('renderDigestNotification', () => {
    it('summarizes multiple outages', () => {
      const outages = [
        makePayload({ serviceName: 'GitHub' }),
        makePayload({ serviceName: 'AWS S3', outageState: 'DEGRADED' }),
        makePayload({ serviceName: 'Cloudflare', outageState: 'INVESTIGATING' }),
      ];

      const template = engine.renderDigestNotification(outages);
      expect(template.subject).toBe('[OpenPulse] Digest: 3 services affected');
      expect(template.body).toContain('GitHub');
      expect(template.body).toContain('AWS S3');
      expect(template.body).toContain('Cloudflare');
    });

    it('uses singular for single outage', () => {
      const template = engine.renderDigestNotification([makePayload()]);
      expect(template.subject).toBe('[OpenPulse] Digest: 1 service affected');
    });

    it('includes confidence for each outage in body', () => {
      const outages = [
        makePayload({ confidence: 0.85 }),
        makePayload({ confidence: 0.95 }),
      ];
      const template = engine.renderDigestNotification(outages);
      expect(template.body).toContain('85%');
      expect(template.body).toContain('95%');
    });
  });

  describe('priorityFromState', () => {
    it('maps MAJOR_OUTAGE to critical', () => {
      expect(engine.priorityFromState('MAJOR_OUTAGE')).toBe(
        NotificationPriority.CRITICAL,
      );
    });

    it('maps DEGRADED to high', () => {
      expect(engine.priorityFromState('DEGRADED')).toBe(
        NotificationPriority.HIGH,
      );
    });

    it('maps INVESTIGATING to medium', () => {
      expect(engine.priorityFromState('INVESTIGATING')).toBe(
        NotificationPriority.MEDIUM,
      );
    });

    it('maps RESOLVED to low', () => {
      expect(engine.priorityFromState('RESOLVED')).toBe(
        NotificationPriority.LOW,
      );
    });

    it('maps unknown state to low', () => {
      expect(engine.priorityFromState('UNKNOWN')).toBe(
        NotificationPriority.LOW,
      );
    });
  });

  describe('formatRegions', () => {
    it('returns None for empty list', () => {
      expect(engine.formatRegions([])).toBe('None');
    });

    it('joins up to 3 regions with commas', () => {
      expect(engine.formatRegions(['US East', 'EU West', 'AP South'])).toBe(
        'US East, EU West, AP South',
      );
    });

    it('truncates with "and N more" for more than 3 regions', () => {
      const regions = ['US East', 'EU West', 'AP South', 'US West', 'EU North'];
      expect(engine.formatRegions(regions)).toBe(
        'US East, EU West, and 3 more',
      );
    });
  });

  describe('formatDuration', () => {
    it('formats hours and minutes', () => {
      const twoHours15Min = 2 * 3600_000 + 15 * 60_000;
      expect(engine.formatDuration(twoHours15Min)).toBe('2h 15m');
    });

    it('formats minutes only', () => {
      expect(engine.formatDuration(45 * 60_000)).toBe('45m');
    });

    it('formats seconds for short durations', () => {
      expect(engine.formatDuration(30_000)).toBe('30s');
    });

    it('formats zero as 0s', () => {
      expect(engine.formatDuration(0)).toBe('0s');
    });

    it('handles negative as 0s', () => {
      expect(engine.formatDuration(-1000)).toBe('0s');
    });
  });

  describe('formatConfidence', () => {
    it('formats 0.92 as 92%', () => {
      expect(engine.formatConfidence(0.92)).toBe('92%');
    });

    it('formats 1.0 as 100%', () => {
      expect(engine.formatConfidence(1.0)).toBe('100%');
    });

    it('formats 0 as 0%', () => {
      expect(engine.formatConfidence(0)).toBe('0%');
    });
  });
});
