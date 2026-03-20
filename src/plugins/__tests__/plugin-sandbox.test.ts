import { describe, expect, it, vi } from 'vitest';
import { PluginSandbox } from '../plugin-sandbox.js';
import type {
  DetectionPlugin,
  DetectionPluginResult,
  DetectionSignal,
  NotificationPlugin,
  PluginManifest,
  ServiceCatalogEntry,
  VisualizationPlugin,
} from '../types.js';
import { PluginCategory, PluginPermission } from '../types.js';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'sandbox-test',
    name: 'Sandbox Test Plugin',
    version: '1.0.0',
    author: 'Test',
    description: 'Test plugin for sandbox',
    category: PluginCategory.DETECTION,
    entrypoint: 'index.js',
    permissions: [
      PluginPermission.READ_SIGNALS,
      PluginPermission.READ_CATALOG,
      PluginPermission.READ_CONFIG,
    ],
    ...overrides,
  };
}

function makeSignal(overrides: Partial<DetectionSignal> = {}): DetectionSignal {
  return {
    serviceId: 'svc-1',
    anomalyScore: 4.0,
    confidence: 0.8,
    currentRate: 200,
    expectedRate: 100,
    timestamp: new Date(),
    metadata: {},
    ...overrides,
  };
}

function makeCatalog(): ServiceCatalogEntry[] {
  return [
    {
      id: 'svc-1',
      slug: 'github',
      name: 'GitHub',
      category: 'developer_tools',
      url: 'https://github.com',
    },
    {
      id: 'svc-2',
      slug: 'slack',
      name: 'Slack',
      category: 'communication',
      url: 'https://slack.com',
    },
  ];
}

describe('PluginSandbox', () => {
  describe('createContext', () => {
    it('provides signals when READ_SIGNALS permission granted', () => {
      const sandbox = new PluginSandbox();
      const signals = [makeSignal({ serviceId: 'svc-1' }), makeSignal({ serviceId: 'svc-2' })];
      const context = sandbox.createContext(makeManifest(), signals, makeCatalog());

      const result = context.getSignals('svc-1');
      expect(result).toHaveLength(1);
      expect(result[0]!.serviceId).toBe('svc-1');
    });

    it('denies signals when READ_SIGNALS permission not granted', () => {
      const sandbox = new PluginSandbox();
      const context = sandbox.createContext(
        makeManifest({ permissions: [] }),
        [makeSignal()],
        [],
      );

      expect(() => context.getSignals('svc-1')).toThrow('Permission denied');
    });

    it('provides service catalog when READ_CATALOG permission granted', () => {
      const sandbox = new PluginSandbox();
      const context = sandbox.createContext(makeManifest(), [], makeCatalog());

      const catalog = context.getServiceCatalog();
      expect(catalog).toHaveLength(2);
      expect(catalog[0]!.slug).toBe('github');
    });

    it('denies catalog access when READ_CATALOG permission not granted', () => {
      const sandbox = new PluginSandbox();
      const context = sandbox.createContext(
        makeManifest({ permissions: [PluginPermission.READ_SIGNALS] }),
        [],
        makeCatalog(),
      );

      expect(() => context.getServiceCatalog()).toThrow('Permission denied');
    });

    it('provides config when READ_CONFIG permission granted', () => {
      const sandbox = new PluginSandbox();
      const context = sandbox.createContext(
        makeManifest(),
        [],
        [],
        { threshold: 5.0, enabled: true },
      );

      expect(context.getConfig<number>('threshold')).toBe(5.0);
      expect(context.getConfig<boolean>('enabled')).toBe(true);
      expect(context.getConfig('nonexistent')).toBeUndefined();
    });

    it('denies config access when READ_CONFIG permission not granted', () => {
      const sandbox = new PluginSandbox();
      const context = sandbox.createContext(
        makeManifest({ permissions: [PluginPermission.READ_SIGNALS] }),
        [],
        [],
        { key: 'value' },
      );

      expect(() => context.getConfig('key')).toThrow('Permission denied');
    });

    it('captures log output', () => {
      const sandbox = new PluginSandbox();
      const manifest = makeManifest();
      const context = sandbox.createContext(manifest, [], []);

      context.log('info', 'hello');
      context.log('error', 'something broke');

      const logs = sandbox.getLogs(manifest.id);
      expect(logs).toHaveLength(2);
      expect(logs[0]!.level).toBe('info');
      expect(logs[0]!.message).toBe('hello');
      expect(logs[1]!.level).toBe('error');
    });

    it('getService returns specific service', () => {
      const sandbox = new PluginSandbox();
      const context = sandbox.createContext(makeManifest(), [], makeCatalog());

      const svc = context.getService('svc-1');
      expect(svc).toBeDefined();
      expect(svc!.name).toBe('GitHub');
      expect(context.getService('nonexistent')).toBeUndefined();
    });
  });

  describe('validateCode', () => {
    it('rejects code referencing blocked globals', () => {
      const sandbox = new PluginSandbox();
      const result = sandbox.validateCode('const p = process.env.SECRET');
      expect(result.safe).toBe(false);
      expect(result.violations.some((v) => v.includes('process'))).toBe(true);
    });

    it('rejects code importing blocked modules', () => {
      const sandbox = new PluginSandbox();
      const result = sandbox.validateCode('const fs = require("fs")');
      expect(result.safe).toBe(false);
      expect(result.violations.some((v) => v.includes('fs'))).toBe(true);
    });

    it('rejects import of net module', () => {
      const sandbox = new PluginSandbox();
      const result = sandbox.validateCode('import net from "net"');
      expect(result.safe).toBe(false);
      expect(result.violations.some((v) => v.includes('net'))).toBe(true);
    });

    it('rejects require of child_process', () => {
      const sandbox = new PluginSandbox();
      const result = sandbox.validateCode('require("child_process")');
      expect(result.safe).toBe(false);
      expect(result.violations.some((v) => v.includes('child_process'))).toBe(true);
    });

    it('accepts safe code', () => {
      const sandbox = new PluginSandbox();
      const result = sandbox.validateCode('const x = 1 + 2; return x;');
      expect(result.safe).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('executeDetection', () => {
    it('executes a detection plugin successfully', async () => {
      const sandbox = new PluginSandbox();
      const manifest = makeManifest();
      const context = sandbox.createContext(manifest, [makeSignal()], []);

      const plugin: DetectionPlugin = {
        name: 'test-detector',
        evaluate: (serviceId) => ({
          pluginId: 'test',
          serviceId,
          detected: true,
          score: 4.5,
          confidence: 0.9,
          message: 'Anomaly found',
          timestamp: new Date(),
        }),
      };

      const result = await sandbox.executeDetection(plugin, 'svc-1', [makeSignal()], context);
      expect(result.success).toBe(true);
      expect(result.result!.detected).toBe(true);
      expect(result.result!.score).toBe(4.5);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('handles plugin errors safely', async () => {
      const sandbox = new PluginSandbox();
      const manifest = makeManifest();
      const context = sandbox.createContext(manifest, [], []);

      const plugin: DetectionPlugin = {
        name: 'bad-detector',
        evaluate: () => {
          throw new Error('Plugin crashed');
        },
      };

      const result = await sandbox.executeDetection(plugin, 'svc-1', [], context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Plugin crashed');
    });

    it('times out on long-running plugins', async () => {
      const sandbox = new PluginSandbox({ cpuTimeLimitMs: 50 });
      const manifest = makeManifest();
      const context = sandbox.createContext(manifest, [], []);

      const plugin: DetectionPlugin = {
        name: 'slow-detector',
        evaluate: () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({
              pluginId: 'slow',
              serviceId: 'svc-1',
              detected: false,
              score: 0,
              confidence: 0,
              message: 'done',
              timestamp: new Date(),
            }), 5000);
          }),
      };

      const result = await sandbox.executeDetection(plugin, 'svc-1', [], context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    }, 10000);
  });

  describe('executeNotification', () => {
    it('executes a notification plugin successfully', async () => {
      const sandbox = new PluginSandbox();
      const manifest = makeManifest({ category: PluginCategory.NOTIFICATION });
      const context = sandbox.createContext(manifest, [], []);

      const plugin: NotificationPlugin = {
        name: 'test-notifier',
        send: async () => ({
          success: true,
          deliveredAt: new Date(),
        }),
      };

      const result = await sandbox.executeNotification(
        plugin,
        {
          serviceId: 'svc-1',
          serviceName: 'GitHub',
          outageState: 'DEGRADED',
          confidence: 0.9,
          message: 'Outage detected',
          timestamp: new Date(),
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.result!.success).toBe(true);
    });
  });

  describe('executeVisualization', () => {
    it('executes a visualization plugin successfully', async () => {
      const sandbox = new PluginSandbox();
      const manifest = makeManifest({ category: PluginCategory.VISUALIZATION });
      const context = sandbox.createContext(manifest, [makeSignal()], []);

      const plugin: VisualizationPlugin = {
        name: 'test-viz',
        render: () => ({
          type: 'chart',
          title: 'Anomaly Timeline',
          data: { points: [1, 2, 3] },
        }),
      };

      const result = await sandbox.executeVisualization(plugin, 'svc-1', [makeSignal()], context);
      expect(result.success).toBe(true);
      expect(result.result!.type).toBe('chart');
      expect(result.result!.title).toBe('Anomaly Timeline');
    });
  });

  describe('getConfig', () => {
    it('returns sandbox configuration', () => {
      const sandbox = new PluginSandbox({ cpuTimeLimitMs: 3000 });
      const config = sandbox.getConfig();
      expect(config.cpuTimeLimitMs).toBe(3000);
      expect(config.blockedModules).toContain('fs');
      expect(config.blockedModules).toContain('net');
      expect(config.blockedModules).toContain('child_process');
    });
  });
});
