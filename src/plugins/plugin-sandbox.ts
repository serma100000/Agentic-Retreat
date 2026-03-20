/**
 * Plugin sandbox for the OpenPulse plugin system.
 *
 * Provides an isolated execution environment for plugins with
 * restricted globals, CPU time limits, and memory tracking.
 */

import type {
  AnyPlugin,
  DetectionPlugin,
  DetectionPluginResult,
  DetectionSignal,
  NotificationPlugin,
  NotificationPluginPayload,
  NotificationPluginResult,
  PluginContext,
  PluginManifest,
  PluginSandboxConfig,
  ServiceCatalogEntry,
  VisualizationOutput,
  VisualizationPlugin,
} from './types.js';
import {
  DEFAULT_SANDBOX_CONFIG,
  PluginCategory,
  PluginPermission,
  type PluginPermissionType,
} from './types.js';

export interface SandboxExecutionResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  executionTimeMs: number;
  memoryUsedBytes: number;
}

interface SandboxLog {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
}

export class PluginSandbox {
  private readonly config: PluginSandboxConfig;
  private readonly logs: Map<string, SandboxLog[]> = new Map();
  private memoryTracking: Map<string, number> = new Map();

  constructor(config?: Partial<PluginSandboxConfig>) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  }

  /**
   * Create a restricted plugin context based on the plugin's permissions.
   */
  createContext(
    manifest: PluginManifest,
    signals: DetectionSignal[] = [],
    catalog: ServiceCatalogEntry[] = [],
    configValues: Record<string, unknown> = {},
  ): PluginContext {
    const permissions = new Set<PluginPermissionType>(manifest.permissions);
    const pluginLogs: SandboxLog[] = [];
    this.logs.set(manifest.id, pluginLogs);

    return {
      getSignals: (serviceId: string): DetectionSignal[] => {
        if (!permissions.has(PluginPermission.READ_SIGNALS)) {
          throw new Error('Permission denied: read:signals not granted');
        }
        return signals.filter((s) => s.serviceId === serviceId);
      },

      getServiceCatalog: (): ServiceCatalogEntry[] => {
        if (!permissions.has(PluginPermission.READ_CATALOG)) {
          throw new Error('Permission denied: read:catalog not granted');
        }
        return [...catalog];
      },

      getService: (serviceId: string): ServiceCatalogEntry | undefined => {
        if (!permissions.has(PluginPermission.READ_CATALOG)) {
          throw new Error('Permission denied: read:catalog not granted');
        }
        return catalog.find((s) => s.id === serviceId);
      },

      getConfig: <T = unknown>(key: string): T | undefined => {
        if (!permissions.has(PluginPermission.READ_CONFIG)) {
          throw new Error('Permission denied: read:config not granted');
        }
        return configValues[key] as T | undefined;
      },

      log: (level: 'debug' | 'info' | 'warn' | 'error', message: string): void => {
        pluginLogs.push({ level, message, timestamp: new Date() });
      },
    };
  }

  /**
   * Check if code references blocked globals or modules.
   */
  validateCode(code: string): { safe: boolean; violations: string[] } {
    const violations: string[] = [];

    for (const blocked of this.config.blockedGlobals) {
      const regex = new RegExp(`\\b${blocked}\\b`, 'g');
      if (regex.test(code)) {
        violations.push(`Blocked global reference: ${blocked}`);
      }
    }

    for (const blocked of this.config.blockedModules) {
      const importRegex = new RegExp(
        `(?:require\\s*\\(\\s*['"]${blocked}['"]\\s*\\)|import\\s+.*from\\s+['"]${blocked}['"])`,
        'g',
      );
      if (importRegex.test(code)) {
        violations.push(`Blocked module import: ${blocked}`);
      }
    }

    return { safe: violations.length === 0, violations };
  }

  /**
   * Execute a detection plugin within the sandbox.
   */
  async executeDetection(
    plugin: DetectionPlugin,
    serviceId: string,
    signals: DetectionSignal[],
    context: PluginContext,
  ): Promise<SandboxExecutionResult<DetectionPluginResult>> {
    return this.executeWithLimits(
      plugin.name,
      () => plugin.evaluate(serviceId, signals, context),
    );
  }

  /**
   * Execute a notification plugin within the sandbox.
   */
  async executeNotification(
    plugin: NotificationPlugin,
    payload: NotificationPluginPayload,
    context: PluginContext,
  ): Promise<SandboxExecutionResult<NotificationPluginResult>> {
    return this.executeWithLimits(
      plugin.name,
      () => plugin.send(payload, context),
    );
  }

  /**
   * Execute a visualization plugin within the sandbox.
   */
  async executeVisualization(
    plugin: VisualizationPlugin,
    serviceId: string,
    signals: DetectionSignal[],
    context: PluginContext,
  ): Promise<SandboxExecutionResult<VisualizationOutput>> {
    return this.executeWithLimits(
      plugin.name,
      () => plugin.render(serviceId, signals, context),
    );
  }

  /**
   * Execute any plugin function within time and memory constraints.
   */
  async executeWithLimits<T>(
    pluginName: string,
    fn: () => T | Promise<T>,
  ): Promise<SandboxExecutionResult<T>> {
    const startTime = Date.now();
    const memBefore = this.estimateMemory();

    try {
      const result = await Promise.race([
        Promise.resolve().then(fn),
        this.createTimeout(this.config.cpuTimeLimitMs),
      ]);

      const executionTimeMs = Date.now() - startTime;
      const memAfter = this.estimateMemory();
      const memoryUsedBytes = Math.max(0, memAfter - memBefore);

      this.memoryTracking.set(pluginName, memoryUsedBytes);

      if (memoryUsedBytes > this.config.memoryLimitBytes) {
        return {
          success: false,
          error: `Memory limit exceeded: ${memoryUsedBytes} bytes used, limit is ${this.config.memoryLimitBytes}`,
          executionTimeMs,
          memoryUsedBytes,
        };
      }

      return {
        success: true,
        result: result as T,
        executionTimeMs,
        memoryUsedBytes,
      };
    } catch (err) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      return {
        success: false,
        error: errorMessage,
        executionTimeMs,
        memoryUsedBytes: 0,
      };
    }
  }

  /**
   * Get logs captured from a plugin.
   */
  getLogs(pluginId: string): SandboxLog[] {
    return this.logs.get(pluginId) ?? [];
  }

  /**
   * Get memory usage tracked for a plugin.
   */
  getMemoryUsage(pluginName: string): number {
    return this.memoryTracking.get(pluginName) ?? 0;
  }

  /**
   * Get sandbox configuration.
   */
  getConfig(): Readonly<PluginSandboxConfig> {
    return { ...this.config };
  }

  // ---- Private ----

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(`Plugin execution timed out after ${ms}ms`));
      }, ms);
    });
  }

  private estimateMemory(): number {
    if (typeof globalThis !== 'undefined' && 'process' in globalThis) {
      try {
        const proc = globalThis as unknown as { process: { memoryUsage: () => { heapUsed: number } } };
        return proc.process.memoryUsage().heapUsed;
      } catch {
        return 0;
      }
    }
    return 0;
  }
}
