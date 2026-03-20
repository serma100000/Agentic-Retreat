import { describe, expect, it } from 'vitest';
import { PluginLoader } from '../plugin-loader.js';
import type { AnyPlugin, DetectionPlugin, PluginManifest } from '../types.js';
import { PluginCategory, PluginPermission, PluginStatus } from '../types.js';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test plugin for unit testing',
    category: PluginCategory.DETECTION,
    entrypoint: 'index.js',
    permissions: [PluginPermission.READ_SIGNALS, PluginPermission.READ_CONFIG],
    ...overrides,
  };
}

function makeDetectionPlugin(name = 'test'): DetectionPlugin {
  return {
    name,
    evaluate: (_serviceId, _signals, _context) => ({
      pluginId: 'test-plugin',
      serviceId: _serviceId,
      detected: false,
      score: 0,
      confidence: 0.5,
      message: 'No anomaly detected',
      timestamp: new Date(),
    }),
  };
}

describe('PluginLoader', () => {
  describe('validateManifest', () => {
    it('accepts a valid manifest', () => {
      const loader = new PluginLoader();
      const result = loader.validateManifest(makeManifest());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects null manifest', () => {
      const loader = new PluginLoader();
      const result = loader.validateManifest(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Manifest must be a non-null object');
    });

    it('catches missing required fields', () => {
      const loader = new PluginLoader();
      const result = loader.validateManifest({ id: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('name'))).toBe(true);
      expect(result.errors.some((e) => e.includes('version'))).toBe(true);
    });

    it('rejects invalid id format', () => {
      const loader = new PluginLoader();
      const result = loader.validateManifest(makeManifest({ id: 'INVALID ID!' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid id'))).toBe(true);
    });

    it('rejects invalid version format', () => {
      const loader = new PluginLoader();
      const result = loader.validateManifest(makeManifest({ version: 'abc' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid version'))).toBe(true);
    });

    it('rejects invalid category', () => {
      const loader = new PluginLoader();
      const result = loader.validateManifest(
        makeManifest({ category: 'invalid' as any }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid category'))).toBe(true);
    });

    it('rejects invalid permissions', () => {
      const loader = new PluginLoader();
      const result = loader.validateManifest(
        makeManifest({ permissions: ['fake:permission' as any] }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid permission'))).toBe(true);
    });
  });

  describe('loadPlugin', () => {
    it('loads a valid plugin successfully', () => {
      const loader = new PluginLoader();
      const manifest = makeManifest();
      const loaded = loader.loadPlugin(manifest, () => makeDetectionPlugin());

      expect(loaded.status).toBe(PluginStatus.ACTIVE);
      expect(loaded.manifest.id).toBe('test-plugin');
      expect(loaded.instance).toBeDefined();
      expect(loaded.loadedAt).toBeInstanceOf(Date);
    });

    it('rejects plugin with invalid manifest', () => {
      const loader = new PluginLoader();
      const manifest = makeManifest({ version: 'bad' });

      expect(() =>
        loader.loadPlugin(manifest, () => makeDetectionPlugin()),
      ).toThrow('Invalid plugin manifest');
    });

    it('rejects duplicate plugin IDs', () => {
      const loader = new PluginLoader();
      const manifest = makeManifest();
      loader.loadPlugin(manifest, () => makeDetectionPlugin());

      expect(() =>
        loader.loadPlugin(manifest, () => makeDetectionPlugin()),
      ).toThrow('already loaded');
    });

    it('handles factory errors gracefully', () => {
      const loader = new PluginLoader();
      const manifest = makeManifest();

      expect(() =>
        loader.loadPlugin(manifest, () => {
          throw new Error('Factory explosion');
        }),
      ).toThrow('Failed to load plugin');
    });
  });

  describe('unloadPlugin', () => {
    it('removes a loaded plugin', () => {
      const loader = new PluginLoader();
      loader.loadPlugin(makeManifest(), () => makeDetectionPlugin());

      const removed = loader.unloadPlugin('test-plugin');
      expect(removed).toBe(true);
      expect(loader.getPlugin('test-plugin')).toBeUndefined();
    });

    it('returns false for non-existent plugin', () => {
      const loader = new PluginLoader();
      expect(loader.unloadPlugin('nonexistent')).toBe(false);
    });
  });

  describe('listPlugins', () => {
    it('returns all loaded plugins', () => {
      const loader = new PluginLoader();
      loader.loadPlugin(makeManifest({ id: 'plugin-a' }), () => makeDetectionPlugin('a'));
      loader.loadPlugin(makeManifest({ id: 'plugin-b' }), () => makeDetectionPlugin('b'));

      const list = loader.listPlugins();
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.manifest.id)).toContain('plugin-a');
      expect(list.map((p) => p.manifest.id)).toContain('plugin-b');
    });

    it('returns empty array when no plugins loaded', () => {
      const loader = new PluginLoader();
      expect(loader.listPlugins()).toHaveLength(0);
    });
  });

  describe('listByCategory', () => {
    it('filters plugins by category', () => {
      const loader = new PluginLoader();
      loader.loadPlugin(
        makeManifest({ id: 'det-1', category: PluginCategory.DETECTION }),
        () => makeDetectionPlugin(),
      );
      loader.loadPlugin(
        makeManifest({ id: 'viz-1', category: PluginCategory.VISUALIZATION }),
        () => makeDetectionPlugin(),
      );

      const detection = loader.listByCategory(PluginCategory.DETECTION);
      expect(detection).toHaveLength(1);
      expect(detection[0]!.manifest.id).toBe('det-1');
    });
  });

  describe('isActive', () => {
    it('returns true for active plugin', () => {
      const loader = new PluginLoader();
      loader.loadPlugin(makeManifest(), () => makeDetectionPlugin());
      expect(loader.isActive('test-plugin')).toBe(true);
    });

    it('returns false for non-existent plugin', () => {
      const loader = new PluginLoader();
      expect(loader.isActive('nonexistent')).toBe(false);
    });
  });

  describe('count', () => {
    it('tracks plugin count correctly', () => {
      const loader = new PluginLoader();
      expect(loader.count()).toBe(0);

      loader.loadPlugin(makeManifest({ id: 'p1' }), () => makeDetectionPlugin());
      expect(loader.count()).toBe(1);

      loader.loadPlugin(makeManifest({ id: 'p2' }), () => makeDetectionPlugin());
      expect(loader.count()).toBe(2);

      loader.unloadPlugin('p1');
      expect(loader.count()).toBe(1);
    });
  });
});
