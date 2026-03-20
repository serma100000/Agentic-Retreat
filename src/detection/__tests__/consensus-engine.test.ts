import { describe, expect, it, vi } from 'vitest';
import { ConsensusEngine } from '../consensus-engine.js';
import type { DetectionEvent } from '../types.js';
import { DetectionLayer, OutageState } from '../types.js';

function makeEvent(overrides: Partial<DetectionEvent> = {}): DetectionEvent {
  return {
    id: crypto.randomUUID(),
    service_id: 'svc-1',
    detection_layer: DetectionLayer.STATISTICAL,
    anomaly_score: 4.0,
    current_rate: 200,
    expected_rate: 100,
    std_dev: 10,
    threshold: 3.0,
    confidence: 0.8,
    region_breakdown: [],
    timestamp: new Date(),
    ...overrides,
  };
}

function advanceTime(base: Date, ms: number): Date {
  return new Date(base.getTime() + ms);
}

const FIVE_MINUTES = 5 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const THREE_MINUTES = 3 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

describe('ConsensusEngine', () => {
  describe('initial state', () => {
    it('starts in OPERATIONAL state', () => {
      const engine = new ConsensusEngine();
      const info = engine.getState('svc-1');
      expect(info.state).toBe(OutageState.OPERATIONAL);
      expect(info.confidence).toBe(0);
    });
  });

  describe('OPERATIONAL -> INVESTIGATING', () => {
    it('transitions when anomaly score > 3.0', () => {
      const engine = new ConsensusEngine();
      const event = makeEvent({ anomaly_score: 3.5 });
      const transition = engine.processDetectionEvent('svc-1', event);

      expect(transition).not.toBeNull();
      expect(transition!.from).toBe(OutageState.OPERATIONAL);
      expect(transition!.to).toBe(OutageState.INVESTIGATING);
    });

    it('does not transition when anomaly score <= 3.0', () => {
      const engine = new ConsensusEngine();
      const event = makeEvent({ anomaly_score: 2.5 });
      const transition = engine.processDetectionEvent('svc-1', event);
      expect(transition).toBeNull();
      expect(engine.getState('svc-1').state).toBe(OutageState.OPERATIONAL);
    });
  });

  describe('INVESTIGATING -> OPERATIONAL (timeout)', () => {
    it('returns to OPERATIONAL after 10 minutes with no events', () => {
      const engine = new ConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // Enter INVESTIGATING
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, timestamp: t0 }),
      );
      expect(engine.getState('svc-1').state).toBe(OutageState.INVESTIGATING);

      // Check timeout after 10 minutes
      const t1 = advanceTime(t0, TEN_MINUTES + 1);
      const transition = engine.checkTimeouts('svc-1', t1);

      expect(transition).not.toBeNull();
      expect(transition!.from).toBe(OutageState.INVESTIGATING);
      expect(transition!.to).toBe(OutageState.OPERATIONAL);
    });

    it('does NOT return to OPERATIONAL before 10 minutes', () => {
      const engine = new ConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, timestamp: t0 }),
      );

      const t1 = advanceTime(t0, 5 * 60 * 1000); // 5 minutes
      const transition = engine.checkTimeouts('svc-1', t1);
      expect(transition).toBeNull();
      expect(engine.getState('svc-1').state).toBe(OutageState.INVESTIGATING);
    });
  });

  describe('INVESTIGATING -> DEGRADED', () => {
    it('transitions when sustained 5+ minutes with confidence > 0.7', () => {
      const engine = new ConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // Enter INVESTIGATING
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t0 }),
      );
      expect(engine.getState('svc-1').state).toBe(OutageState.INVESTIGATING);

      // Send another event after 5+ minutes with high confidence
      const t1 = advanceTime(t0, FIVE_MINUTES + 1000);
      const transition = engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t1 }),
      );

      expect(transition).not.toBeNull();
      expect(transition!.to).toBe(OutageState.DEGRADED);
    });

    it('does NOT transition with low confidence', () => {
      const engine = new ConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.5, timestamp: t0 }),
      );

      const t1 = advanceTime(t0, FIVE_MINUTES + 1000);
      const transition = engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.5, timestamp: t1 }),
      );

      // Still INVESTIGATING because confidence <= 0.7
      expect(transition).toBeNull();
      expect(engine.getState('svc-1').state).toBe(OutageState.INVESTIGATING);
    });
  });

  describe('DEGRADED -> MAJOR_OUTAGE', () => {
    it('transitions when score > 5.0 sustained 3+ minutes', () => {
      const engine = new ConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // OPERATIONAL -> INVESTIGATING
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t0 }),
      );

      // INVESTIGATING -> DEGRADED (5+ minutes later)
      const t1 = advanceTime(t0, FIVE_MINUTES + 1000);
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t1 }),
      );
      expect(engine.getState('svc-1').state).toBe(OutageState.DEGRADED);

      // DEGRADED -> MAJOR_OUTAGE (score > 5.0, 3+ minutes later)
      const t2 = advanceTime(t1, THREE_MINUTES + 1000);
      const transition = engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 6.0, confidence: 0.9, timestamp: t2 }),
      );

      expect(transition).not.toBeNull();
      expect(transition!.to).toBe(OutageState.MAJOR_OUTAGE);
    });

    it('transitions with 3+ independent signals', () => {
      const engine = new ConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // Get to DEGRADED state
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t0 }),
      );
      const t1 = advanceTime(t0, FIVE_MINUTES + 1000);
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t1 }),
      );
      expect(engine.getState('svc-1').state).toBe(OutageState.DEGRADED);

      // Send signals from 3 different layers
      const t2 = advanceTime(t1, 1000);
      const signals = [
        makeEvent({ detection_layer: DetectionLayer.STATISTICAL, anomaly_score: 4.0, timestamp: t2 }),
        makeEvent({ detection_layer: DetectionLayer.CUSUM, anomaly_score: 4.0, timestamp: t2 }),
        makeEvent({ detection_layer: DetectionLayer.LSTM, anomaly_score: 4.0, timestamp: t2 }),
      ];

      const result = engine.processMultiSignalConsensus('svc-1', signals);
      expect(result.state).toBe(OutageState.MAJOR_OUTAGE);
    });
  });

  describe('MAJOR_OUTAGE -> RECOVERING', () => {
    it('transitions when score drops below 3.0', () => {
      const engine = new ConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // Fast-track to MAJOR_OUTAGE using 3+ independent signals
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t0 }),
      );
      const t1 = advanceTime(t0, FIVE_MINUTES + 1000);
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t1 }),
      );
      const t2 = advanceTime(t1, 1000);
      engine.processMultiSignalConsensus('svc-1', [
        makeEvent({ detection_layer: DetectionLayer.STATISTICAL, anomaly_score: 4.0, timestamp: t2 }),
        makeEvent({ detection_layer: DetectionLayer.CUSUM, anomaly_score: 4.0, timestamp: t2 }),
        makeEvent({ detection_layer: DetectionLayer.LSTM, anomaly_score: 4.0, timestamp: t2 }),
      ]);
      expect(engine.getState('svc-1').state).toBe(OutageState.MAJOR_OUTAGE);

      // Score drops below 3.0
      const t3 = advanceTime(t2, 60_000);
      const transition = engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 2.5, timestamp: t3 }),
      );

      expect(transition).not.toBeNull();
      expect(transition!.to).toBe(OutageState.RECOVERING);
    });
  });

  describe('RECOVERING -> RESOLVED', () => {
    it('transitions when score below 1.5 for 15+ minutes', () => {
      const engine = new ConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // Get to RECOVERING state
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t0 }),
      );
      const t1 = advanceTime(t0, FIVE_MINUTES + 1000);
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t1 }),
      );
      // DEGRADED -> RECOVERING (score < 2.0)
      const t2 = advanceTime(t1, 1000);
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 1.5, timestamp: t2 }),
      );
      expect(engine.getState('svc-1').state).toBe(OutageState.RECOVERING);

      // Score below 1.5 for 15+ minutes
      const t3 = advanceTime(t2, FIFTEEN_MINUTES + 1000);
      const transition = engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 1.0, timestamp: t3 }),
      );

      expect(transition).not.toBeNull();
      expect(transition!.to).toBe(OutageState.RESOLVED);
    });
  });

  describe('full outage lifecycle', () => {
    it('progresses through all states correctly', () => {
      const engine = new ConsensusEngine();
      const transitions: string[] = [];
      engine.onStateChange((_id, t) => transitions.push(`${t.from}->${t.to}`));

      const t0 = new Date('2024-06-01T12:00:00Z');

      // 1. OPERATIONAL -> INVESTIGATING
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t0 }),
      );
      expect(engine.getState('svc-1').state).toBe(OutageState.INVESTIGATING);

      // 2. INVESTIGATING -> DEGRADED (5+ min)
      const t1 = advanceTime(t0, FIVE_MINUTES + 1000);
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t1 }),
      );
      expect(engine.getState('svc-1').state).toBe(OutageState.DEGRADED);

      // 3. DEGRADED -> MAJOR_OUTAGE (score > 5.0, 3+ min)
      const t2 = advanceTime(t1, THREE_MINUTES + 1000);
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 6.0, confidence: 0.9, timestamp: t2 }),
      );
      expect(engine.getState('svc-1').state).toBe(OutageState.MAJOR_OUTAGE);

      // 4. MAJOR_OUTAGE -> RECOVERING (score < 3.0)
      const t3 = advanceTime(t2, 60_000);
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 2.5, timestamp: t3 }),
      );
      expect(engine.getState('svc-1').state).toBe(OutageState.RECOVERING);

      // 5. RECOVERING -> RESOLVED (score < 1.5 for 15+ min)
      const t4 = advanceTime(t3, FIFTEEN_MINUTES + 1000);
      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 1.0, timestamp: t4 }),
      );
      expect(engine.getState('svc-1').state).toBe(OutageState.RESOLVED);

      expect(transitions).toEqual([
        'OPERATIONAL->INVESTIGATING',
        'INVESTIGATING->DEGRADED',
        'DEGRADED->MAJOR_OUTAGE',
        'MAJOR_OUTAGE->RECOVERING',
        'RECOVERING->RESOLVED',
      ]);
    });
  });

  describe('hysteresis prevents premature transitions', () => {
    it('does not jump OPERATIONAL -> MAJOR_OUTAGE directly', () => {
      const engine = new ConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      // Even with a very high score, should go OPERATIONAL -> INVESTIGATING first
      const transition = engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 10.0, confidence: 0.99, timestamp: t0 }),
      );

      expect(transition).not.toBeNull();
      expect(transition!.to).toBe(OutageState.INVESTIGATING);
      expect(engine.getState('svc-1').state).toBe(OutageState.INVESTIGATING);
    });

    it('INVESTIGATING does not skip to MAJOR_OUTAGE', () => {
      const engine = new ConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0, confidence: 0.8, timestamp: t0 }),
      );

      // Even with score > 5.0 right after, should not skip DEGRADED
      const t1 = advanceTime(t0, 1000);
      const transition = engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 8.0, confidence: 0.95, timestamp: t1 }),
      );

      // Still INVESTIGATING because 5 minutes haven't passed
      expect(transition).toBeNull();
      expect(engine.getState('svc-1').state).toBe(OutageState.INVESTIGATING);
    });
  });

  describe('multi-signal confidence', () => {
    it('combines signals from multiple layers', () => {
      const engine = new ConsensusEngine();
      const t0 = new Date('2024-06-01T12:00:00Z');

      const signals = [
        makeEvent({
          detection_layer: DetectionLayer.STATISTICAL,
          anomaly_score: 4.0,
          confidence: 0.8,
          timestamp: t0,
        }),
        makeEvent({
          detection_layer: DetectionLayer.CUSUM,
          anomaly_score: 3.5,
          confidence: 0.7,
          timestamp: t0,
        }),
      ];

      const result = engine.processMultiSignalConsensus('svc-1', signals);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.signals.length).toBeGreaterThanOrEqual(2);
    });

    it('returns zero confidence with no signals', () => {
      const engine = new ConsensusEngine();
      const result = engine.processMultiSignalConsensus('svc-1', []);
      expect(result.confidence).toBe(0);
    });
  });

  describe('state change events', () => {
    it('emits state change handler on transition', () => {
      const engine = new ConsensusEngine();
      const handler = vi.fn();
      engine.onStateChange(handler);

      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 4.0 }),
      );

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith('svc-1', expect.objectContaining({
        from: OutageState.OPERATIONAL,
        to: OutageState.INVESTIGATING,
      }));
    });

    it('does not emit when no transition occurs', () => {
      const engine = new ConsensusEngine();
      const handler = vi.fn();
      engine.onStateChange(handler);

      engine.processDetectionEvent(
        'svc-1',
        makeEvent({ anomaly_score: 2.0 }), // below threshold
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
