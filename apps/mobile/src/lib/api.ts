import Constants from 'expo-constants';
import type { Service, Outage, Report, ProbeResult } from '../navigation/types';

const BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ?? 'https://api.openpulse.dev';

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ApiError(response.status, response.statusText, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: string,
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

// Services
export async function getServices(): Promise<Service[]> {
  return request<Service[]>('/api/v1/services');
}

export async function getService(id: string): Promise<Service> {
  return request<Service>(`/api/v1/services/${id}`);
}

export async function searchServices(query: string): Promise<Service[]> {
  return request<Service[]>(
    `/api/v1/services?search=${encodeURIComponent(query)}`,
  );
}

export async function getServicesByCategory(
  category: string,
): Promise<Service[]> {
  return request<Service[]>(
    `/api/v1/services?category=${encodeURIComponent(category)}`,
  );
}

// Outages
export async function getActiveOutages(): Promise<Outage[]> {
  return request<Outage[]>('/api/v1/outages?status=active');
}

export async function getOutage(id: string): Promise<Outage> {
  return request<Outage>(`/api/v1/outages/${id}`);
}

export async function getServiceOutages(serviceId: string): Promise<Outage[]> {
  return request<Outage[]>(`/api/v1/services/${serviceId}/outages`);
}

// Reports
export async function submitReport(
  serviceId: string,
  type: 'outage' | 'degraded' | 'operational',
  description?: string,
  region?: string,
): Promise<Report> {
  return request<Report>('/api/v1/reports', {
    method: 'POST',
    body: JSON.stringify({ serviceId, type, description, region }),
  });
}

export async function getServiceReports(
  serviceId: string,
  hours: number = 24,
): Promise<Report[]> {
  return request<Report[]>(
    `/api/v1/services/${serviceId}/reports?hours=${hours}`,
  );
}

export async function getReportStats(
  serviceId: string,
): Promise<{ hourly: { hour: string; count: number }[] }> {
  return request<{ hourly: { hour: string; count: number }[] }>(
    `/api/v1/services/${serviceId}/reports/stats`,
  );
}

// Probes
export async function getServiceProbes(
  serviceId: string,
): Promise<ProbeResult[]> {
  return request<ProbeResult[]>(`/api/v1/services/${serviceId}/probes`);
}

// Auth
export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: { id: string; email: string; displayName: string } }> {
  const result = await request<{
    token: string;
    user: { id: string; email: string; displayName: string };
  }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setAuthToken(result.token);
  return result;
}

export async function logout(): Promise<void> {
  await request<void>('/api/v1/auth/logout', { method: 'POST' });
  setAuthToken(null);
}

// Push notifications
export async function registerPushToken(token: string): Promise<void> {
  return request<void>('/api/v1/notifications/register', {
    method: 'POST',
    body: JSON.stringify({ token, platform: 'expo' }),
  });
}

export async function updateNotificationPreferences(
  preferences: {
    outages: boolean;
    degraded: boolean;
    resolved: boolean;
    watchlistOnly: boolean;
  },
): Promise<void> {
  return request<void>('/api/v1/notifications/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  });
}

// Watchlist
export async function getWatchlist(): Promise<Service[]> {
  return request<Service[]>('/api/v1/watchlist');
}

export async function addToWatchlist(serviceId: string): Promise<void> {
  return request<void>('/api/v1/watchlist', {
    method: 'POST',
    body: JSON.stringify({ serviceId }),
  });
}

export async function removeFromWatchlist(serviceId: string): Promise<void> {
  return request<void>(`/api/v1/watchlist/${serviceId}`, {
    method: 'DELETE',
  });
}
