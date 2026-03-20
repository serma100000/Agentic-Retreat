/**
 * Detection plugin runner for the OpenPulse plugin system.
 *
 * Runs custom detection plugins within the sandbox and returns
 * combined results that integrate with the consensus engine.
 */

import type {
  DetectionPlugin,
  DetectionPluginResult,
  DetectionSignal,
  PluginContext,
  PluginManifest,
  ServiceCatalogEntry,
} from './types.js';
import { PluginCategory, PluginPermission } from './types.js';
import { PluginSandbox, type SandboxExecutionResult } from './plugin-sandbox.js';
import type { LoadedPlugin } from './plugin-loader.js';
import { PluginLoader } from './plugin-loader.js';

export interface PluginDetectionResult {
  pluginId: string;
  pluginName: string;
  result: DetectionPluginResult | null;
  error?: string;
  executionTimeMs: number;
}

export interface CombinedPluginResults {
  serviceId: string;
  results: PluginDetectionResult[];
  aggregateScore: number;
  aggregateConfidence: number;
  anyDetected: boolean;
  timestamp: Date;
}

export class DetectionPluginRunner {
  private readonly loader: PluginLoader;
  private readonly sandbox: PluginSandbox;
  private readonly latestResults = new Map<string, CombinedPluginResults>();
  private readonly catalog: ServiceCatalogEntry[];
  private readonly configValues: Record<string, unknown>;

  constructor(
    loader: PluginLoader,
    sandbox?: PluginSandbox,
    catalog: ServiceCatalogEntry[] = [],
    configValues: Record<string, unknown> = {},
  ) {
    this.loader = loader;
    this.sandbox = sandbox ?? new PluginSandbox();
    this.catalog = catalog;
    this.configValues = configValues;
  }

  /**
   * Run all loaded detection plugins for a given service and signals.
   */
  async runAll(
    serviceId: string,
    signals: DetectionSignal[],
  ): Promise<CombinedPluginResults> {
    const detectionPlugins = this.loader.listByCategory(PluginCategory.DETECTION);
    const results: PluginDetectionResult[] = [];

    for (const loaded of detectionPlugins) {
      if (!this.loader.isActive(loaded.manifest.id)) {
        continue;
      }

      const pluginResult = await this.runSinglePlugin(loaded, serviceId, signals);
      results.push(pluginResult);
    }

    const combined = this.aggregateResults(serviceId, results);
    this.latestResults.set(serviceId, combined);
    return combined;
  }

  /**
   * Run a single detection plugin by its ID.
   */
  async runPlugin(
    pluginId: string,
    serviceId: string,
    signals: DetectionSignal[],
  ): Promise<PluginDetectionResult> {
    const loaded = this.loader.getPlugin(pluginId);
    if (!loaded) {
      return {
        pluginId,
        pluginName: 'unknown',
        result: null,
        error: `Plugin "${pluginId}" not found`,
        executionTimeMs: 0,
      };
    }

    if (loaded.manifest.category !== PluginCategory.DETECTION) {
      return {
        pluginId,
        pluginName: loaded.manifest.name,
        result: null,
        error: `Plugin "${pluginId}" is not a detection plugin`,
        executionTimeMs: 0,
      };
    }

    return this.runSinglePlugin(loaded, serviceId, signals);
  }

  /**
   * Get the latest combined results for a service.
   */
  getResults(serviceId: string): CombinedPluginResults | undefined {
    return this.latestResults.get(serviceId);
  }

  /**
   * Get results for all services that have been evaluated.
   */
  getAllResults(): Map<string, CombinedPluginResults> {
    return new Map(this.latestResults);
  }

  /**
   * Clear cached results for a service.
   */
  clearResults(serviceId: string): void {
    this.latestResults.delete(serviceId);
  }

  // ---- Private ----

  private async runSinglePlugin(
    loaded: LoadedPlugin,
    serviceId: string,
    signals: DetectionSignal[],
  ): Promise<PluginDetectionResult> {
    const context = this.sandbox.createContext(
      loaded.manifest,
      signals,
      this.catalog,
      this.configValues,
    );

    const plugin = loaded.instance as DetectionPlugin;

    const sandboxResult: SandboxExecutionResult<DetectionPluginResult> =
      await this.sandbox.executeDetection(plugin, serviceId, signals, context);

    if (sandboxResult.success && sandboxResult.result) {
      return {
        pluginId: loaded.manifest.id,
        pluginName: loaded.manifest.name,
        result: sandboxResult.result,
        executionTimeMs: sandboxResult.executionTimeMs,
      };
    }

    return {
      pluginId: loaded.manifest.id,
      pluginName: loaded.manifest.name,
      result: null,
      error: sandboxResult.error ?? 'Unknown execution error',
      executionTimeMs: sandboxResult.executionTimeMs,
    };
  }

  private aggregateResults(
    serviceId: string,
    results: PluginDetectionResult[],
  ): CombinedPluginResults {
    const successfulResults = results.filter((r) => r.result !== null);

    let aggregateScore = 0;
    let aggregateConfidence = 0;
    let anyDetected = false;

    if (successfulResults.length > 0) {
      let totalWeight = 0;
      for (const r of successfulResults) {
        const result = r.result!;
        const weight = result.confidence;
        aggregateScore += result.score * weight;
        aggregateConfidence += result.confidence;
        totalWeight += weight;

        if (result.detected) {
          anyDetected = true;
        }
      }

      if (totalWeight > 0) {
        aggregateScore = aggregateScore / totalWeight;
      }
      aggregateConfidence = aggregateConfidence / successfulResults.length;
    }

    return {
      serviceId,
      results,
      aggregateScore,
      aggregateConfidence,
      anyDetected,
      timestamp: new Date(),
    };
  }
}
