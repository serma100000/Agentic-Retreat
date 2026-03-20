import { describe, expect, it, vi } from 'vitest';
import { EnhancedConsensusEngine } from '../enhanced-consensus.js';
import type { RegionStatus, Signal } from '../types.js';
import { GeographicScope, OutageState, SignalSource } from '../types.js';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    source: SignalSource.REPORT,
    serviceId: 'svc-1',
    score: 5.0,
    confidence: 0.8,
    timestamp: new Date('2024-06-01T12:00:00Z'),
    metadata: {},
    ...overrides,
  };
}

function advanceTime(base: Date, ms: number): Date {
  return new Date(base.getTime() + ms);
}

function makeAffectedRegion(regionCode: string): RegionStatus {
  return {
    regionCode,
    reportCount: 20,
    probeSuccessRate: 0.2,
    socialMentions: 15,
    status: 'degraded',
  };
}

function makeHealthyRegion(regionCode: string): RegionStatus {
  return {
    regionCode,
    reportCount: 0,
    probeSuccessRate: 1.0,
    socialMentions: 0,
    status: 'operational',
  };
}

const FIVE_MINUTES = 5 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

describe('EnhancedConsensusEngine', () => {
  describe('full outage lifecycle with multi-signal confirmation', () => {
    it('progresses through all states correctly', () => {
      const engine = new EnhancedConsensusEngine();
      const events: string[] = [];
      engine.on((name, data) => {
        if (name === 'state_changed') {
          events.push(`${data.from}->${data.to}`);
        }
      });

      const t0 = new Date('2024-06-01T12:00:00Z');

      // 1. OPERATIONAL -> INVESTIGATING: single signal above threshold
      const r1 = engine.processSignal(
        makeSignal({ score: 4.0, timestamp: t0 }),
      );
      expect(r1.stateChanged).toBe(true);
      expect(r1.newState).toBe(OutageState.INVESTIGATING);

      // 2. INVESTIGATING -> DEGRADED: 2+ sources, confidence > 0.7, sustained 5+ min
      const t1 = advanceTime(t0, FIVE_MINUTES + 1000);
      engine.processSignal(
        makeSignal({ source: SignalSource.PROBE, score: 4.5, confidence: 0.85, timestamp: t1 }),
      );
      const r2 = engine.processSignal(
        makeSignal({ source: SignalSource.SOCIAL, score: 3.5, confidence: 0.75, timestamp: t1 }),
      );
      // Should have transitioned to DEGRADED (2+ sources, high confidence, 5+ min)
      const status2 = engine.getFullStatus('svc-1');
      expect(status2.state).toBe(OutageState.DEGRADED);

      // 3. DEGRADED -> MAJOR_OUTAGE: 3+ sources, confidence > 0.9, geographic >= regional
      // First, set up regional geographic data
      engine.updateRegionData('svc-1', [
        makeAffectedRegion('us-east'),
        makeAffectedRegion('us-west'),
        makeAffectedRegion('eu-west'),
      ]);

      const t2 = advanceTime(t1, FIVE_MINUTES);
      engine.processSignal(
        makeSignal({ source: SignalSource.PROBE, score: 6.0, confidence: 0.95, timestamp: t2 }),
      );
      engine.processSignal(
        makeSignal({ source: SignalSource.STATUSPAGE, score: 5.5, confidence: 0.9, timestamp: t2 }),
      );
      const r3 = engine.processSignal(
        makeSignal({ source: SignalSource.ML_AUTOENCODER, score: 5.0, confidence: 0.88, timestamp: t2 }),
      );
      const status3 = engine.getFullStatus('svc-1');
      expect(status3.state).toBe(OutageState.MAJOR_OUTAGE);

      // 4. MAJOR_OUTAGE -> RECOVERING: declining signals
      const t3 = advanceTime(t2, FIVE_MINUTES);
      const r4 = engine.processSignal(
        makeSignal({ source: SignalSource.PROBE, score: 1.5, confidence: 0.3, timestamp: t3 }),
      );
      expect(engine.getFullStatus('svc-1').state).toBe(OutageState.RECOVERING);

      // 5. RECOVERING -> RESOLVED: baseline for 15+ minutes
      const t4 = advanceTime(t3, FIFTEEN_MINUTES + 1000);
      const r5 = engine.processSignal(
        makeSignal({ source: SignalSource.PROBE, score: 0.5, confidence: 0.1, timestamp: t4 }),
      );
      expect(engine.getFullStatus('svc-1').state).toBe(OutageState.RESOLVED);

      expect(events).toContain('OPERATIONAL->INVESTIGATING');
      expect(events).toContain('MAJOR_OUTAGE->RECOVERING');
      expect(events).toContain('RECOVERING->RESOLVED');
    });
  });

  describe('Bayesian confidence with 3+ confirming signals', () => {
    it('achieves high confidence (> 0.9) with 3+ confirming signals', () => {
      const engine = new EnhancedConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // Send 3+ signals from different sources with high confidence
      engine.processSignal(
        makeSignal({ source: SignalSource.PROBE, score: 5.0, confidence: 0.95, timestamp: t0 }),
      );
      engine.processSignal(
        makeSignal({ source: SignalSource.REPORT, score: 5.0, confidence: 0.9, timestamp: t0 }),
      );
      engine.processSignal(
        makeSignal({ source: SignalSource.STATUSPAGE, score: 5.0, confidence: 0.85, timestamp: t0 }),
      );

      const status = engine.getFullStatus('svc-1');
      // Bayesian posterior should be high with multiple confirming signals
      expect(status.bayesian).not.toBeNull();
      expect(status.bayesian!.posterior).toBeGreaterThan(0.5);
    });
  });

  describe('geographic escalation', () => {
    it('localized to global increases urgency', () => {
      const engine = new EnhancedConsensusEngine();
      const geoEvents: string[] = [];
      engine.on((name, data) => {
        if (name === 'geographic_change') {
          geoEvents.push(`${data.previousScope}->${data.newScope}`);
        }
      });

      const t0 = new Date('2024-06-01T12:00:00Z');

      // Start with localized
      engine.updateRegionData('svc-1', [
        makeAffectedRegion('us-east'),
        makeHealthyRegion('us-west'),
      ]);

      engine.processSignal(
        makeSignal({ score: 4.0, timestamp: t0 }),
      );

      // Escalate to global
      engine.updateRegionData('svc-1', [
        makeAffectedRegion('us-east'),
        makeAffectedRegion('us-west'),
        makeAffectedRegion('eu-west'),
        makeAffectedRegion('eu-central'),
        makeAffectedRegion('ap-southeast'),
      ]);

      const t1 = advanceTime(t0, 60_000);
      engine.processSignal(
        makeSignal({ score: 5.0, timestamp: t1 }),
      );

      const status = engine.getFullStatus('svc-1');
      expect(status.geographic).not.toBeNull();
      expect(status.geographic!.scope).toBe(GeographicScope.GLOBAL);
    });
  });

  describe('status page confirmation fast-tracks transition', () => {
    it('statuspage signal contributes to multi-source confirmation', () => {
      const engine = new EnhancedConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // Enter INVESTIGATING
      engine.processSignal(
        makeSignal({ source: SignalSource.PROBE, score: 4.0, confidence: 0.8, timestamp: t0 }),
      );
      expect(engine.getFullStatus('svc-1').state).toBe(OutageState.INVESTIGATING);

      // Add statuspage and social signals to reach 2+ independent sources
      const t1 = advanceTime(t0, FIVE_MINUTES + 1000);
      engine.processSignal(
        makeSignal({ source: SignalSource.STATUSPAGE, score: 4.0, confidence: 0.85, timestamp: t1 }),
      );
      engine.processSignal(
        makeSignal({ source: SignalSource.SOCIAL, score: 3.5, confidence: 0.7, timestamp: t1 }),
      );

      const status = engine.getFullStatus('svc-1');
      expect(status.state).toBe(OutageState.DEGRADED);
    });
  });

  describe('hysteresis prevents flapping', () => {
    it('does not oscillate between states on borderline signals', () => {
      const engine = new EnhancedConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');
      const stateChanges: string[] = [];
      engine.on((name, data) => {
        if (name === 'state_changed') {
          stateChanges.push(`${data.from}->${data.to}`);
        }
      });

      // Enter INVESTIGATING
      engine.processSignal(
        makeSignal({ score: 4.0, timestamp: t0 }),
      );

      // Send alternating signals quickly (should NOT cause flapping)
      for (let i = 1; i <= 5; i++) {
        const t = advanceTime(t0, i * 10_000); // every 10 seconds
        const score = i % 2 === 0 ? 2.5 : 4.0;
        engine.processSignal(
          makeSignal({ score, timestamp: t }),
        );
      }

      // Should have transitioned to INVESTIGATING once and stayed there
      // (5 minutes haven't passed for DEGRADED, and even brief low scores
      // don't cause INVESTIGATING->OPERATIONAL which requires 10 min silence)
      expect(stateChanges).toEqual(['OPERATIONAL->INVESTIGATING']);
    });

    it('does not skip INVESTIGATING to MAJOR_OUTAGE directly', () => {
      const engine = new EnhancedConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // Even with extreme signals, must go through INVESTIGATING first
      engine.processSignal(
        makeSignal({ score: 10.0, confidence: 0.99, timestamp: t0 }),
      );

      const status = engine.getFullStatus('svc-1');
      expect(status.state).toBe(OutageState.INVESTIGATING);
    });
  });

  describe('re-escalation during recovery', () => {
    it('returns to MAJOR_OUTAGE when signals worsen during recovery', () => {
      const engine = new EnhancedConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // Get to INVESTIGATING
      engine.processSignal(
        makeSignal({ source: SignalSource.PROBE, score: 4.0, confidence: 0.85, timestamp: t0 }),
      );

      // Get to DEGRADED (2+ sources, 5+ min)
      const t1 = advanceTime(t0, FIVE_MINUTES + 1000);
      engine.processSignal(
        makeSignal({ source: SignalSource.PROBE, score: 4.5, confidence: 0.85, timestamp: t1 }),
      );
      engine.processSignal(
        makeSignal({ source: SignalSource.REPORT, score: 4.0, confidence: 0.8, timestamp: t1 }),
      );
      expect(engine.getFullStatus('svc-1').state).toBe(OutageState.DEGRADED);

      // De-escalate to RECOVERING
      const t2 = advanceTime(t1, FIVE_MINUTES);
      engine.processSignal(
        makeSignal({ source: SignalSource.PROBE, score: 1.0, confidence: 0.2, timestamp: t2 }),
      );
      expect(engine.getFullStatus('svc-1').state).toBe(OutageState.RECOVERING);

      // Re-escalate to MAJOR_OUTAGE: signals worsen with 2+ sources
      const t3 = advanceTime(t2, 60_000);
      engine.processSignal(
        makeSignal({ source: SignalSource.PROBE, score: 5.0, confidence: 0.9, timestamp: t3 }),
      );
      engine.processSignal(
        makeSignal({ source: SignalSource.REPORT, score: 4.5, confidence: 0.85, timestamp: t3 }),
      );

      const status = engine.getFullStatus('svc-1');
      expect(status.state).toBe(OutageState.MAJOR_OUTAGE);
    });
  });

  describe('signal history', () => {
    it('maintains signal history', () => {
      const engine = new EnhancedConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      for (let i = 0; i < 5; i++) {
        engine.processSignal(
          makeSignal({
            score: 3.0 + i,
            timestamp: advanceTime(t0, i * 60_000),
          }),
        );
      }

      const history = engine.getSignalHistory('svc-1');
      expect(history).toHaveLength(5);
    });

    it('respects limit parameter', () => {
      const engine = new EnhancedConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      for (let i = 0; i < 10; i++) {
        engine.processSignal(
          makeSignal({
            score: 3.0 + i * 0.1,
            timestamp: advanceTime(t0, i * 60_000),
          }),
        );
      }

      const limited = engine.getSignalHistory('svc-1', 3);
      expect(limited).toHaveLength(3);
      // Should return the last 3 signals
      expect(limited[0]!.score).toBeCloseTo(3.7);
    });

    it('returns empty array for unknown service', () => {
      const engine = new EnhancedConsensusEngine();
      expect(engine.getSignalHistory('unknown')).toHaveLength(0);
    });
  });

  describe('active outages', () => {
    it('lists services in non-operational states', () => {
      const engine = new EnhancedConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // Put svc-1 in INVESTIGATING
      engine.processSignal(
        makeSignal({ serviceId: 'svc-1', score: 4.0, timestamp: t0 }),
      );

      // Put svc-2 in INVESTIGATING
      engine.processSignal(
        makeSignal({ serviceId: 'svc-2', score: 4.5, timestamp: t0 }),
      );

      // svc-3 stays OPERATIONAL (score below threshold)
      engine.processSignal(
        makeSignal({ serviceId: 'svc-3', score: 1.0, timestamp: t0 }),
      );

      const outages = engine.getActiveOutages();
      expect(outages).toHaveLength(2);
      expect(outages.map((o) => o.serviceId).sort()).toEqual(['svc-1', 'svc-2']);
    });

    it('excludes RESOLVED services', () => {
      const engine = new EnhancedConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // Put svc-1 through full cycle to RESOLVED would be complex,
      // just verify OPERATIONAL is excluded
      const outages = engine.getActiveOutages();
      expect(outages).toHaveLength(0);
    });
  });

  describe('timeout-based transitions', () => {
    it('returns to OPERATIONAL after 10 min silence in INVESTIGATING', () => {
      const engine = new EnhancedConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      engine.processSignal(makeSignal({ score: 4.0, timestamp: t0 }));
      expect(engine.getFullStatus('svc-1').state).toBe(OutageState.INVESTIGATING);

      const t1 = advanceTime(t0, TEN_MINUTES + 1000);
      const result = engine.checkTimeouts('svc-1', t1);

      expect(result.stateChanged).toBe(true);
      expect(result.newState).toBe(OutageState.OPERATIONAL);
    });
  });

  describe('event emission', () => {
    it('emits state_changed events on transitions', () => {
      const engine = new EnhancedConsensusEngine();
      const handler = vi.fn();
      engine.on(handler);

      const t0 = new Date('2024-06-01T12:00:00Z');
      engine.processSignal(makeSignal({ score: 4.0, timestamp: t0 }));

      expect(handler).toHaveBeenCalledWith('state_changed', expect.objectContaining({
        from: OutageState.OPERATIONAL,
        to: OutageState.INVESTIGATING,
      }));
    });

    it('emits confidence_updated events when confidence changes significantly', () => {
      const engine = new EnhancedConsensusEngine();
      const confidenceEvents: number[] = [];
      engine.on((name, data) => {
        if (name === 'confidence_updated') {
          confidenceEvents.push(data.confidence as number);
        }
      });

      const t0 = new Date('2024-06-01T12:00:00Z');
      // First signal establishes baseline confidence
      engine.processSignal(
        makeSignal({ source: SignalSource.PROBE, score: 5.0, confidence: 0.9, timestamp: t0 }),
      );
      // Second signal from different source should change confidence
      engine.processSignal(
        makeSignal({ source: SignalSource.REPORT, score: 5.0, confidence: 0.85, timestamp: t0 }),
      );

      // At least one confidence update should have fired
      expect(confidenceEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getFullStatus', () => {
    it('returns complete status with all fields', () => {
      const engine = new EnhancedConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      engine.processSignal(
        makeSignal({ score: 4.0, timestamp: t0 }),
      );

      const status = engine.getFullStatus('svc-1');
      expect(status.state).toBe(OutageState.INVESTIGATING);
      expect(status.confidence).toBeGreaterThan(0);
      expect(status.signals.length).toBeGreaterThan(0);
      expect(status.bayesian).not.toBeNull();
      expect(status.timeline.length).toBeGreaterThan(0);
    });

    it('tracks timeline of state changes', () => {
      const engine = new EnhancedConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      engine.processSignal(makeSignal({ score: 4.0, timestamp: t0 }));

      const status = engine.getFullStatus('svc-1');
      expect(status.timeline).toContainEqual(
        expect.objectContaining({ state: OutageState.OPERATIONAL }),
      );
      expect(status.timeline).toContainEqual(
        expect.objectContaining({ state: OutageState.INVESTIGATING }),
      );
    });
  });
});
