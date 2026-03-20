import { describe, it, expect } from 'vitest';
import { FeatureStore } from '../feature-store.js';
import type { FeatureVector } from '../types.js';

describe('FeatureStore', () => {
  it('should store and retrieve features', async () => {
    const store = new FeatureStore();
    const features: Partial<FeatureVector> = {
      reportRate: 1.5,
      probeLatency: 100,
      probeSuccessRate: 0.99,
      socialMentionRate: 0.3,
      timestamp: Date.now(),
    };

    await store.updateFeatures('svc-1', features);
    const retrieved = await store.getFeatures('svc-1');

    expect(retrieved).not.toBeNull();
    expect(retrieved!.reportRate).toBe(1.5);
    expect(retrieved!.probeLatency).toBe(100);
    expect(retrieved!.probeSuccessRate).toBe(0.99);
    expect(retrieved!.socialMentionRate).toBe(0.3);
  });

  it('should return null for unknown service', async () => {
    const store = new FeatureStore();
    const result = await store.getFeatures('nonexistent');
    expect(result).toBeNull();
  });

  it('should merge partial feature updates', async () => {
    const store = new FeatureStore();

    await store.updateFeatures('svc-1', { reportRate: 1.0, probeLatency: 50 });
    await store.updateFeatures('svc-1', { probeLatency: 75 });

    const retrieved = await store.getFeatures('svc-1');
    expect(retrieved!.reportRate).toBe(1.0);
    expect(retrieved!.probeLatency).toBe(75);
  });

  it('should maintain a sliding window', async () => {
    const store = new FeatureStore();
    const baseTime = Date.now();

    for (let i = 0; i < 5; i++) {
      await store.updateFeatures('svc-1', {
        reportRate: i,
        probeLatency: i * 10,
        probeSuccessRate: 1.0,
        socialMentionRate: 0,
        timestamp: baseTime + i * 60_000,
      });
    }

    const window = await store.getWindow('svc-1');
    expect(window).toHaveLength(5);
  });

  it('should return window ordered oldest to newest', async () => {
    const store = new FeatureStore();
    const baseTime = Date.now();

    // Insert out of order
    await store.updateFeatures('svc-1', {
      reportRate: 3,
      timestamp: baseTime + 3000,
    });
    await store.updateFeatures('svc-1', {
      reportRate: 1,
      timestamp: baseTime + 1000,
    });
    await store.updateFeatures('svc-1', {
      reportRate: 2,
      timestamp: baseTime + 2000,
    });

    const window = await store.getWindow('svc-1');
    expect(window).toHaveLength(3);
    expect(window[0]!.timestamp).toBeLessThan(window[1]!.timestamp);
    expect(window[1]!.timestamp).toBeLessThan(window[2]!.timestamp);
  });

  it('should limit window size', async () => {
    const store = new FeatureStore();
    const baseTime = Date.now();

    for (let i = 0; i < 100; i++) {
      await store.updateFeatures('svc-1', {
        reportRate: i,
        timestamp: baseTime + i * 60_000,
      });
    }

    const window = await store.getWindow('svc-1', 10);
    expect(window).toHaveLength(10);

    // Should be the 10 most recent
    expect(window[0]!.reportRate).toBe(90);
    expect(window[9]!.reportRate).toBe(99);
  });

  it('should keep multiple services separate', async () => {
    const store = new FeatureStore();

    await store.updateFeatures('svc-a', { reportRate: 10 });
    await store.updateFeatures('svc-b', { reportRate: 20 });

    const a = await store.getFeatures('svc-a');
    const b = await store.getFeatures('svc-b');

    expect(a!.reportRate).toBe(10);
    expect(b!.reportRate).toBe(20);
  });

  it('should not interfere between service windows', async () => {
    const store = new FeatureStore();
    const baseTime = Date.now();

    for (let i = 0; i < 5; i++) {
      await store.updateFeatures('svc-a', {
        reportRate: i,
        timestamp: baseTime + i * 1000,
      });
    }
    for (let i = 0; i < 3; i++) {
      await store.updateFeatures('svc-b', {
        reportRate: i * 10,
        timestamp: baseTime + i * 1000,
      });
    }

    const windowA = await store.getWindow('svc-a');
    const windowB = await store.getWindow('svc-b');

    expect(windowA).toHaveLength(5);
    expect(windowB).toHaveLength(3);
  });

  it('should work without Redis (cache fallback)', async () => {
    // No Redis client passed
    const store = new FeatureStore(null);

    await store.updateFeatures('svc-1', { reportRate: 5 });
    const result = await store.getFeatures('svc-1');
    expect(result!.reportRate).toBe(5);

    const window = await store.getWindow('svc-1');
    expect(window).toHaveLength(1);
  });

  it('should list all service features', async () => {
    const store = new FeatureStore();

    await store.updateFeatures('svc-a', { reportRate: 1 });
    await store.updateFeatures('svc-b', { reportRate: 2 });
    await store.updateFeatures('svc-c', { reportRate: 3 });

    const all = await store.getAllServiceFeatures();
    expect(all.size).toBe(3);
    expect(all.get('svc-a')!.reportRate).toBe(1);
    expect(all.get('svc-b')!.reportRate).toBe(2);
    expect(all.get('svc-c')!.reportRate).toBe(3);
  });

  it('should delete a service', async () => {
    const store = new FeatureStore();

    await store.updateFeatures('svc-1', { reportRate: 5 });
    await store.deleteService('svc-1');

    const result = await store.getFeatures('svc-1');
    expect(result).toBeNull();

    const window = await store.getWindow('svc-1');
    expect(window).toHaveLength(0);
  });

  it('should clear all data', async () => {
    const store = new FeatureStore();

    await store.updateFeatures('svc-a', { reportRate: 1 });
    await store.updateFeatures('svc-b', { reportRate: 2 });

    store.clear();

    const all = await store.getAllServiceFeatures();
    expect(all.size).toBe(0);
  });

  it('should return empty window for unknown service', async () => {
    const store = new FeatureStore();
    const window = await store.getWindow('nonexistent');
    expect(window).toHaveLength(0);
  });
});
