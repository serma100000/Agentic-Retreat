/**
 * Types for the OpenPulse plugin system.
 *
 * Covers plugin manifests, contexts, registries, sandboxing,
 * and the three plugin categories: detection, notification, visualization.
 */

import type { DetectionEvent } from '../detection/types.js';

export const PluginCategory = {
  DETECTION: 'detection',
  NOTIFICATION: 'notification',
  VISUALIZATION: 'visualization',
} as const;

export type PluginCategoryType = (typeof PluginCategory)[keyof typeof PluginCategory];

export const PluginPermission = {
  READ_SIGNALS: 'read:signals',
  READ_CATALOG: 'read:catalog',
  READ_CONFIG: 'read:config',
  WRITE_RESULTS: 'write:results',
  SEND_NOTIFICATION: 'send:notification',
  READ_HISTORY: 'read:history',
} as const;

export type PluginPermissionType = (typeof PluginPermission)[keyof typeof PluginPermission];

export const PluginStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ERROR: 'error',
  LOADING: 'loading',
} as const;

export type PluginStatusType = (typeof PluginStatus)[keyof typeof PluginStatus];

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: PluginCategoryType;
  entrypoint: string;
  permissions: PluginPermissionType[];
  tags?: string[];
  homepage?: string;
  repository?: string;
  minEngineVersion?: string;
}

export interface ServiceCatalogEntry {
  id: string;
  slug: string;
  name: string;
  category: string;
  url: string;
  statusPageUrl?: string;
}

export interface PluginContext {
  /** Current detection signals for a service. */
  getSignals(serviceId: string): DetectionSignal[];
  /** Read-only access to the service catalog. */
  getServiceCatalog(): ServiceCatalogEntry[];
  /** Get a specific service from the catalog. */
  getService(serviceId: string): ServiceCatalogEntry | undefined;
  /** Read plugin configuration values. */
  getConfig<T = unknown>(key: string): T | undefined;
  /** Log output from the plugin (captured by sandbox). */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void;
}

export interface DetectionSignal {
  serviceId: string;
  anomalyScore: number;
  confidence: number;
  currentRate: number;
  expectedRate: number;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface DetectionPluginResult {
  pluginId: string;
  serviceId: string;
  detected: boolean;
  score: number;
  confidence: number;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

export interface DetectionPlugin {
  name: string;
  /** Evaluate detection signals and return a result. */
  evaluate(
    serviceId: string,
    signals: DetectionSignal[],
    context: PluginContext,
  ): DetectionPluginResult | Promise<DetectionPluginResult>;
}

export interface NotificationPlugin {
  name: string;
  /** Send a notification through a custom channel. */
  send(
    payload: NotificationPluginPayload,
    context: PluginContext,
  ): Promise<NotificationPluginResult>;
}

export interface NotificationPluginPayload {
  serviceId: string;
  serviceName: string;
  outageState: string;
  confidence: number;
  message: string;
  timestamp: Date;
}

export interface NotificationPluginResult {
  success: boolean;
  error?: string;
  deliveredAt?: Date;
}

export interface VisualizationPlugin {
  name: string;
  /** Generate visualization data from signals. */
  render(
    serviceId: string,
    signals: DetectionSignal[],
    context: PluginContext,
  ): VisualizationOutput | Promise<VisualizationOutput>;
}

export interface VisualizationOutput {
  type: 'chart' | 'table' | 'timeline' | 'map' | 'custom';
  title: string;
  data: unknown;
  options?: Record<string, unknown>;
}

export interface PluginSandboxConfig {
  /** Maximum CPU time per execution in milliseconds. */
  cpuTimeLimitMs: number;
  /** Maximum memory usage in bytes (tracked, not enforced at OS level). */
  memoryLimitBytes: number;
  /** List of globals that are blocked inside the sandbox. */
  blockedGlobals: string[];
  /** List of modules that are blocked from import. */
  blockedModules: string[];
}

export const DEFAULT_SANDBOX_CONFIG: PluginSandboxConfig = {
  cpuTimeLimitMs: 5000,
  memoryLimitBytes: 50 * 1024 * 1024, // 50 MB
  blockedGlobals: ['process', 'require', 'eval', '__dirname', '__filename'],
  blockedModules: ['fs', 'net', 'child_process', 'cluster', 'dgram', 'dns', 'tls', 'http', 'https'],
};

export interface PluginRegistryEntry {
  manifest: PluginManifest;
  code: string;
  status: PluginStatusType;
  loadedAt: Date | null;
  downloads: number;
  rating: number;
  error?: string;
}

export type AnyPlugin = DetectionPlugin | NotificationPlugin | VisualizationPlugin;
