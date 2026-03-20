/**
 * Chrome storage wrapper for OpenPulse extension.
 *
 * Provides type-safe access to extension settings, subscribed services,
 * and cached data with sensible defaults.
 */

export interface ExtensionSettings {
  apiUrl: string;
  apiKey: string;
  notificationsEnabled: boolean;
  inlineBannerEnabled: boolean;
  theme: 'system' | 'light' | 'dark';
  pollIntervalSeconds: number;
}

export interface ServiceSubscription {
  slug: string;
  name: string;
  domain: string;
}

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

interface StorageSchema {
  settings: ExtensionSettings;
  subscribedServices: ServiceSubscription[];
  cache: Record<string, CacheEntry>;
  lastSeenOutageIds: string[];
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  apiUrl: 'https://api.openpulse.io',
  apiKey: '',
  notificationsEnabled: true,
  inlineBannerEnabled: true,
  theme: 'system',
  pollIntervalSeconds: 60,
};

const DEFAULT_SUBSCRIBED_SERVICES: ServiceSubscription[] = [];

function getStorage(): typeof chrome.storage.local {
  return chrome.storage.local;
}

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await getStorage().get('settings');
  const stored = result['settings'] as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(
  settings: Partial<ExtensionSettings>,
): Promise<void> {
  const current = await getSettings();
  const merged: ExtensionSettings = { ...current, ...settings };
  await getStorage().set({ settings: merged });
}

export async function getSubscribedServices(): Promise<ServiceSubscription[]> {
  const result = await getStorage().get('subscribedServices');
  return (result['subscribedServices'] as ServiceSubscription[] | undefined) ?? DEFAULT_SUBSCRIBED_SERVICES;
}

export async function addService(service: ServiceSubscription): Promise<void> {
  const services = await getSubscribedServices();
  const exists = services.some((s) => s.slug === service.slug);
  if (!exists) {
    services.push(service);
    await getStorage().set({ subscribedServices: services });
  }
}

export async function removeService(slug: string): Promise<void> {
  const services = await getSubscribedServices();
  const filtered = services.filter((s) => s.slug !== slug);
  await getStorage().set({ subscribedServices: filtered });
}

export async function getCache<T = unknown>(
  key: string,
): Promise<T | null> {
  const result = await getStorage().get('cache');
  const cache = (result['cache'] as Record<string, CacheEntry> | undefined) ?? {};
  const entry = cache[key];
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > entry.ttlMs) {
    delete cache[key];
    await getStorage().set({ cache });
    return null;
  }

  return entry.data as T;
}

export async function setCache<T = unknown>(
  key: string,
  data: T,
  ttlMs: number = 60_000,
): Promise<void> {
  const result = await getStorage().get('cache');
  const cache = (result['cache'] as Record<string, CacheEntry> | undefined) ?? {};
  cache[key] = { data, timestamp: Date.now(), ttlMs };
  await getStorage().set({ cache });
}

export async function getLastSeenOutageIds(): Promise<string[]> {
  const result = await getStorage().get('lastSeenOutageIds');
  return (result['lastSeenOutageIds'] as string[] | undefined) ?? [];
}

export async function setLastSeenOutageIds(ids: string[]): Promise<void> {
  await getStorage().set({ lastSeenOutageIds: ids });
}
