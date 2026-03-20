/**
 * Plugin loader for the OpenPulse plugin system.
 *
 * Validates plugin manifests, loads plugin code,
 * and manages the lifecycle of loaded plugins.
 */

import type {
  AnyPlugin,
  PluginManifest,
  PluginCategoryType,
  PluginPermissionType,
  PluginStatusType,
} from './types.js';
import {
  PluginCategory,
  PluginPermission,
  PluginStatus,
} from './types.js';

export interface LoadedPlugin {
  manifest: PluginManifest;
  instance: AnyPlugin;
  status: PluginStatusType;
  loadedAt: Date;
  error?: string;
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

const REQUIRED_MANIFEST_FIELDS: (keyof PluginManifest)[] = [
  'id',
  'name',
  'version',
  'author',
  'description',
  'category',
  'entrypoint',
  'permissions',
];

const VALID_CATEGORIES = new Set<string>(Object.values(PluginCategory));
const VALID_PERMISSIONS = new Set<string>(Object.values(PluginPermission));
const VERSION_REGEX = /^\d+\.\d+\.\d+$/;
const ID_REGEX = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;

export class PluginLoader {
  private readonly plugins = new Map<string, LoadedPlugin>();

  /**
   * Validate a plugin manifest for required fields and correct values.
   */
  validateManifest(manifest: unknown): ManifestValidationResult {
    const errors: string[] = [];

    if (!manifest || typeof manifest !== 'object') {
      return { valid: false, errors: ['Manifest must be a non-null object'] };
    }

    const m = manifest as Record<string, unknown>;

    for (const field of REQUIRED_MANIFEST_FIELDS) {
      if (m[field] === undefined || m[field] === null || m[field] === '') {
        errors.push(`Missing required field: ${field}`);
      }
    }

    if (typeof m['id'] === 'string' && !ID_REGEX.test(m['id'])) {
      errors.push(
        'Invalid id: must be lowercase alphanumeric with dots, hyphens, or underscores',
      );
    }

    if (typeof m['version'] === 'string' && !VERSION_REGEX.test(m['version'])) {
      errors.push('Invalid version: must follow semver format (e.g., 1.0.0)');
    }

    if (typeof m['category'] === 'string' && !VALID_CATEGORIES.has(m['category'])) {
      errors.push(
        `Invalid category: ${m['category']}. Must be one of: ${[...VALID_CATEGORIES].join(', ')}`,
      );
    }

    if (Array.isArray(m['permissions'])) {
      for (const perm of m['permissions'] as unknown[]) {
        if (typeof perm !== 'string' || !VALID_PERMISSIONS.has(perm)) {
          errors.push(`Invalid permission: ${String(perm)}`);
        }
      }
    } else if (m['permissions'] !== undefined) {
      errors.push('Permissions must be an array');
    }

    if (typeof m['entrypoint'] === 'string' && m['entrypoint'].length === 0) {
      errors.push('Entrypoint must not be empty');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Load a plugin from its manifest and a factory function that returns the plugin instance.
   */
  loadPlugin(
    manifest: PluginManifest,
    factory: () => AnyPlugin,
  ): LoadedPlugin {
    const validation = this.validateManifest(manifest);
    if (!validation.valid) {
      throw new Error(
        `Invalid plugin manifest for "${manifest.name ?? 'unknown'}": ${validation.errors.join('; ')}`,
      );
    }

    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" is already loaded`);
    }

    let instance: AnyPlugin;
    try {
      instance = factory();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const loaded: LoadedPlugin = {
        manifest,
        instance: null as unknown as AnyPlugin,
        status: PluginStatus.ERROR,
        loadedAt: new Date(),
        error: `Failed to initialize: ${errorMessage}`,
      };
      this.plugins.set(manifest.id, loaded);
      throw new Error(`Failed to load plugin "${manifest.id}": ${errorMessage}`);
    }

    const loaded: LoadedPlugin = {
      manifest,
      instance,
      status: PluginStatus.ACTIVE,
      loadedAt: new Date(),
    };

    this.plugins.set(manifest.id, loaded);
    return loaded;
  }

  /**
   * Unload a plugin by its ID.
   */
  unloadPlugin(id: string): boolean {
    return this.plugins.delete(id);
  }

  /**
   * Get a loaded plugin by ID.
   */
  getPlugin(id: string): LoadedPlugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * List all loaded plugins.
   */
  listPlugins(): LoadedPlugin[] {
    return [...this.plugins.values()];
  }

  /**
   * List plugins filtered by category.
   */
  listByCategory(category: PluginCategoryType): LoadedPlugin[] {
    return this.listPlugins().filter(
      (p) => p.manifest.category === category,
    );
  }

  /**
   * Check if a plugin is loaded and active.
   */
  isActive(id: string): boolean {
    const plugin = this.plugins.get(id);
    return plugin?.status === PluginStatus.ACTIVE;
  }

  /**
   * Get the count of loaded plugins.
   */
  count(): number {
    return this.plugins.size;
  }
}
