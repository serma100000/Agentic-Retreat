import { describe, expect, it } from 'vitest';
import { PluginRegistry } from '../plugin-registry.js';
import type { PluginManifest } from '../types.js';
import { PluginCategory, PluginPermission, PluginStatus } from '../types.js';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test plugin',
    category: PluginCategory.DETECTION,
    entrypoint: 'index.js',
    permissions: [PluginPermission.READ_SIGNALS],
    tags: ['detection', 'anomaly'],
    ...overrides,
  };
}

const SAMPLE_CODE = 'export default { name: "test", evaluate: () => ({}) };';

describe('PluginRegistry', () => {
  describe('register / unregister', () => {
    it('registers a new plugin', () => {
      const registry = new PluginRegistry();
      const entry = registry.register(makeManifest(), SAMPLE_CODE);

      expect(entry.manifest.id).toBe('test-plugin');
      expect(entry.status).toBe(PluginStatus.INACTIVE);
      expect(entry.downloads).toBe(0);
      expect(registry.count()).toBe(1);
    });

    it('rejects duplicate version registration', () => {
      const registry = new PluginRegistry();
      registry.register(makeManifest(), SAMPLE_CODE);

      expect(() => registry.register(makeManifest(), SAMPLE_CODE)).toThrow(
        'already registered',
      );
    });

    it('allows registration of new version', () => {
      const registry = new PluginRegistry();
      registry.register(makeManifest({ version: '1.0.0' }), SAMPLE_CODE);
      // Updating with a new version replaces the entry
      const entry = registry.register(
        makeManifest({ version: '2.0.0' }),
        SAMPLE_CODE,
      );
      expect(entry.manifest.version).toBe('2.0.0');
    });

    it('unregisters a plugin', () => {
      const registry = new PluginRegistry();
      registry.register(makeManifest(), SAMPLE_CODE);
      const removed = registry.unregister('test-plugin');

      expect(removed).toBe(true);
      expect(registry.count()).toBe(0);
      expect(registry.get('test-plugin')).toBeUndefined();
    });

    it('returns false when unregistering non-existent', () => {
      const registry = new PluginRegistry();
      expect(registry.unregister('nonexistent')).toBe(false);
    });
  });

  describe('search', () => {
    it('finds plugins by name', () => {
      const registry = new PluginRegistry();
      registry.register(
        makeManifest({ id: 'spike-detector', name: 'Spike Detector' }),
        SAMPLE_CODE,
      );
      registry.register(
        makeManifest({ id: 'rate-monitor', name: 'Rate Monitor' }),
        SAMPLE_CODE,
      );

      const results = registry.search('spike');
      expect(results).toHaveLength(1);
      expect(results[0]!.manifest.id).toBe('spike-detector');
    });

    it('finds plugins by description', () => {
      const registry = new PluginRegistry();
      registry.register(
        makeManifest({
          id: 'ml-detector',
          name: 'ML Detector',
          description: 'Uses machine learning for anomaly detection',
        }),
        SAMPLE_CODE,
      );

      const results = registry.search('machine learning');
      expect(results).toHaveLength(1);
    });

    it('finds plugins by tags', () => {
      const registry = new PluginRegistry();
      registry.register(
        makeManifest({
          id: 'latency-check',
          name: 'Latency Check',
          tags: ['latency', 'performance'],
        }),
        SAMPLE_CODE,
      );

      const results = registry.search('performance');
      expect(results).toHaveLength(1);
    });

    it('returns empty for no match', () => {
      const registry = new PluginRegistry();
      registry.register(makeManifest(), SAMPLE_CODE);
      expect(registry.search('zzzznonexistentzzzz')).toHaveLength(0);
    });
  });

  describe('getByCategory', () => {
    it('filters plugins by category', () => {
      const registry = new PluginRegistry();
      registry.register(
        makeManifest({ id: 'det-1', category: PluginCategory.DETECTION }),
        SAMPLE_CODE,
      );
      registry.register(
        makeManifest({ id: 'notif-1', category: PluginCategory.NOTIFICATION }),
        SAMPLE_CODE,
      );
      registry.register(
        makeManifest({ id: 'viz-1', category: PluginCategory.VISUALIZATION }),
        SAMPLE_CODE,
      );

      const detection = registry.getByCategory(PluginCategory.DETECTION);
      expect(detection).toHaveLength(1);
      expect(detection[0]!.manifest.id).toBe('det-1');

      const notification = registry.getByCategory(PluginCategory.NOTIFICATION);
      expect(notification).toHaveLength(1);
    });
  });

  describe('getPopular', () => {
    it('returns plugins sorted by downloads', () => {
      const registry = new PluginRegistry();
      registry.register(makeManifest({ id: 'low-dl' }), SAMPLE_CODE);
      registry.register(makeManifest({ id: 'high-dl' }), SAMPLE_CODE);

      // Simulate downloads
      for (let i = 0; i < 100; i++) registry.incrementDownloads('high-dl');
      for (let i = 0; i < 10; i++) registry.incrementDownloads('low-dl');

      const popular = registry.getPopular(2);
      expect(popular[0]!.manifest.id).toBe('high-dl');
      expect(popular[0]!.downloads).toBe(100);
      expect(popular[1]!.manifest.id).toBe('low-dl');
    });

    it('respects limit', () => {
      const registry = new PluginRegistry();
      registry.register(makeManifest({ id: 'p1' }), SAMPLE_CODE);
      registry.register(makeManifest({ id: 'p2' }), SAMPLE_CODE);
      registry.register(makeManifest({ id: 'p3' }), SAMPLE_CODE);

      expect(registry.getPopular(2)).toHaveLength(2);
    });
  });

  describe('validateVersion', () => {
    it('accepts valid semver', () => {
      const registry = new PluginRegistry();
      const result = registry.validateVersion('test', '1.0.0');
      expect(result.valid).toBe(true);
    });

    it('rejects non-semver', () => {
      const registry = new PluginRegistry();
      const result = registry.validateVersion('test', 'abc');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('semver');
    });

    it('rejects duplicate version', () => {
      const registry = new PluginRegistry();
      registry.register(makeManifest({ version: '1.0.0' }), SAMPLE_CODE);

      const result = registry.validateVersion('test-plugin', '1.0.0');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('rejects lower version', () => {
      const registry = new PluginRegistry();
      registry.register(makeManifest({ version: '2.0.0' }), SAMPLE_CODE);

      const result = registry.validateVersion('test-plugin', '1.0.0');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be greater');
    });
  });

  describe('updateStatus', () => {
    it('updates plugin status', () => {
      const registry = new PluginRegistry();
      registry.register(makeManifest(), SAMPLE_CODE);

      registry.updateStatus('test-plugin', PluginStatus.ACTIVE);
      const entry = registry.get('test-plugin');
      expect(entry!.status).toBe(PluginStatus.ACTIVE);
      expect(entry!.loadedAt).toBeInstanceOf(Date);
    });
  });
});
