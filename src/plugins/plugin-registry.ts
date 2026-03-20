/**
 * In-memory plugin registry for the OpenPulse plugin system.
 *
 * Stores available plugins, supports search by keyword and category,
 * tracks download counts and ratings.
 */

import type {
  PluginCategoryType,
  PluginManifest,
  PluginRegistryEntry,
  PluginStatusType,
} from './types.js';
import { PluginStatus } from './types.js';

const VERSION_REGEX = /^\d+\.\d+\.\d+$/;

export class PluginRegistry {
  private readonly entries = new Map<string, PluginRegistryEntry>();

  /**
   * Register a new plugin with its manifest and code.
   */
  register(manifest: PluginManifest, code: string): PluginRegistryEntry {
    if (this.entries.has(manifest.id)) {
      const existing = this.entries.get(manifest.id)!;
      if (existing.manifest.version === manifest.version) {
        throw new Error(
          `Plugin "${manifest.id}" version ${manifest.version} is already registered`,
        );
      }
    }

    const entry: PluginRegistryEntry = {
      manifest,
      code,
      status: PluginStatus.INACTIVE,
      loadedAt: null,
      downloads: 0,
      rating: 0,
    };

    this.entries.set(manifest.id, entry);
    return entry;
  }

  /**
   * Unregister a plugin by ID.
   */
  unregister(id: string): boolean {
    return this.entries.delete(id);
  }

  /**
   * Get a plugin entry by ID.
   */
  get(id: string): PluginRegistryEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * List all registered plugins.
   */
  listAll(): PluginRegistryEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Search plugins by keyword against name, description, and tags.
   */
  search(query: string): PluginRegistryEntry[] {
    const lower = query.toLowerCase();
    return this.listAll().filter((entry) => {
      const { name, description, tags } = entry.manifest;
      if (name.toLowerCase().includes(lower)) return true;
      if (description.toLowerCase().includes(lower)) return true;
      if (tags?.some((t) => t.toLowerCase().includes(lower))) return true;
      return false;
    });
  }

  /**
   * Get plugins by category.
   */
  getByCategory(category: PluginCategoryType): PluginRegistryEntry[] {
    return this.listAll().filter(
      (entry) => entry.manifest.category === category,
    );
  }

  /**
   * Get the most popular plugins sorted by download count.
   */
  getPopular(limit: number): PluginRegistryEntry[] {
    return this.listAll()
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit);
  }

  /**
   * Get top-rated plugins.
   */
  getTopRated(limit: number): PluginRegistryEntry[] {
    return this.listAll()
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
  }

  /**
   * Validate a version string and check it doesn't conflict with existing.
   */
  validateVersion(id: string, version: string): { valid: boolean; error?: string } {
    if (!VERSION_REGEX.test(version)) {
      return { valid: false, error: 'Version must follow semver format (e.g., 1.0.0)' };
    }

    const existing = this.entries.get(id);
    if (existing && existing.manifest.version === version) {
      return { valid: false, error: `Version ${version} already exists for plugin "${id}"` };
    }

    if (existing) {
      const existingParts = existing.manifest.version.split('.').map(Number);
      const newParts = version.split('.').map(Number);

      const existingNum =
        (existingParts[0] ?? 0) * 10000 +
        (existingParts[1] ?? 0) * 100 +
        (existingParts[2] ?? 0);
      const newNum =
        (newParts[0] ?? 0) * 10000 +
        (newParts[1] ?? 0) * 100 +
        (newParts[2] ?? 0);

      if (newNum <= existingNum) {
        return {
          valid: false,
          error: `New version ${version} must be greater than existing ${existing.manifest.version}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Increment download count for a plugin.
   */
  incrementDownloads(id: string): void {
    const entry = this.entries.get(id);
    if (entry) {
      entry.downloads += 1;
    }
  }

  /**
   * Update the status of a registry entry.
   */
  updateStatus(id: string, status: PluginStatusType): void {
    const entry = this.entries.get(id);
    if (entry) {
      entry.status = status;
      if (status === PluginStatus.ACTIVE) {
        entry.loadedAt = new Date();
      }
    }
  }

  /**
   * Get the count of registered plugins.
   */
  count(): number {
    return this.entries.size;
  }
}
