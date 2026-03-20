/**
 * Lightweight API client for the OpenPulse extension.
 *
 * Wraps fetch with error handling, caching, and auth headers.
 */

import { getSettings, getCache, setCache } from './storage.js';

export interface OutageInfo {
  id: string;
  service_id: string;
  service_name: string;
  service_slug: string;
  status: 'INVESTIGATING' | 'DEGRADED' | 'PARTIAL_OUTAGE' | 'MAJOR_OUTAGE';
  confidence: number;
  title: string;
  summary: string;
  started_at: string;
  updated_at: string;
  affected_regions: string[];
}

export interface ServiceStatus {
  slug: string;
  name: string;
  domain: string;
  status: 'OPERATIONAL' | 'INVESTIGATING' | 'DEGRADED' | 'PARTIAL_OUTAGE' | 'MAJOR_OUTAGE';
  current_outage: OutageInfo | null;
  uptime_30d: number;
}

export interface ApiError {
  status: number;
  message: string;
}

const CACHE_TTL_MS = 30_000;

async function buildHeaders(): Promise<Record<string, string>> {
  const settings = await getSettings();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (settings.apiKey) {
    headers['Authorization'] = `Bearer ${settings.apiKey}`;
  }
  return headers;
}

async function request<T>(path: string, cacheKey?: string): Promise<T> {
  if (cacheKey) {
    const cached = await getCache<T>(cacheKey);
    if (cached !== null) return cached;
  }

  const settings = await getSettings();
  const baseUrl = settings.apiUrl.replace(/\/+$/, '');
  const url = `${baseUrl}${path}`;
  const headers = await buildHeaders();

  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const error: ApiError = {
      status: response.status,
      message: body || `HTTP ${response.status}`,
    };
    throw error;
  }

  const data = (await response.json()) as T;

  if (cacheKey) {
    await setCache(cacheKey, data, CACHE_TTL_MS);
  }

  return data;
}

export async function getActiveOutages(): Promise<OutageInfo[]> {
  return request<OutageInfo[]>('/api/v1/outages/active', 'outages:active');
}

export async function getServiceStatus(slug: string): Promise<ServiceStatus> {
  return request<ServiceStatus>(
    `/api/v1/services/${encodeURIComponent(slug)}/status`,
    `service:status:${slug}`,
  );
}

export async function getSubscribedServiceStatuses(
  slugs: string[],
): Promise<ServiceStatus[]> {
  if (slugs.length === 0) return [];

  const params = slugs.map((s) => `slug=${encodeURIComponent(s)}`).join('&');
  return request<ServiceStatus[]>(
    `/api/v1/services/status?${params}`,
    `services:statuses:${slugs.sort().join(',')}`,
  );
}

export async function getAvailableServices(): Promise<
  Array<{ slug: string; name: string; domain: string }>
> {
  return request('/api/v1/services', 'services:list');
}
