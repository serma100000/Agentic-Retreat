/**
 * API client for OpenPulse backend.
 * All functions include proper error handling and typed responses.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Time series data point for report charts. */
export interface TimeSeries {
  readonly timestamp: string;
  readonly count: number;
}

/** Service as returned by the API. */
export interface ServiceResponse {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly homepageUrl: string;
  readonly statusPageUrl?: string;
  readonly iconUrl?: string;
  readonly regions: readonly string[];
  readonly isActive: boolean;
  readonly currentStatus: 'operational' | 'degraded' | 'partial_outage' | 'major_outage';
}

/** Outage summary as returned by the API. */
export interface OutageResponse {
  readonly id: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly state: string;
  readonly severity: string;
  readonly title: string;
  readonly summary?: string;
  readonly affectedRegions: readonly string[];
  readonly confidence: number;
  readonly reportCount: number;
  readonly startedAt: string;
  readonly resolvedAt: string | null;
}

/** Outage detail with timeline. */
export interface OutageDetailResponse extends OutageResponse {
  readonly timeline: {
    readonly events: readonly {
      readonly id: string;
      readonly source: string;
      readonly detail: string;
      readonly confidence: number;
      readonly occurredAt: string;
    }[];
    readonly firstDetectedAt: string;
    readonly lastUpdatedAt: string;
    readonly confirmedAt: string | null;
    readonly resolvedAt: string | null;
  };
}

/** Paginated response envelope. */
export interface PaginatedApiResponse<T> {
  readonly success: boolean;
  readonly data: {
    readonly items: readonly T[];
    readonly pagination: {
      readonly page: number;
      readonly limit: number;
      readonly totalItems: number;
      readonly totalPages: number;
      readonly hasNext: boolean;
      readonly hasPrev: boolean;
    };
  };
}

/** Single-item response envelope. */
export interface ApiResponseEnvelope<T> {
  readonly success: boolean;
  readonly data: T;
}

/** Report submission payload. */
export interface ReportPayload {
  readonly serviceSlug: string;
  readonly type: 'outage' | 'degraded' | 'resolved';
  readonly description?: string;
}

/** Report submission response. */
export interface ReportResponse {
  readonly id: string;
  readonly submittedAt: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let message = `API request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error?.message) {
        message = body.error.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

/** Fetch paginated list of services. */
export async function getServices(params?: {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
}): Promise<PaginatedApiResponse<ServiceResponse>['data']> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.category && params.category !== 'all') searchParams.set('category', params.category);
  if (params?.search) searchParams.set('search', params.search);

  const qs = searchParams.toString();
  const response = await request<PaginatedApiResponse<ServiceResponse>>(
    `/api/v1/services${qs ? `?${qs}` : ''}`,
  );
  return response.data;
}

/** Fetch a single service by slug. */
export async function getService(slug: string): Promise<ServiceResponse> {
  const response = await request<ApiResponseEnvelope<ServiceResponse>>(
    `/api/v1/services/${encodeURIComponent(slug)}`,
  );
  return response.data;
}

/** Fetch report time series for a service. */
export async function getServiceReports(
  slug: string,
  interval: '1h' | '24h' | '7d' = '24h',
): Promise<TimeSeries[]> {
  const response = await request<ApiResponseEnvelope<TimeSeries[]>>(
    `/api/v1/services/${encodeURIComponent(slug)}/reports?interval=${interval}`,
  );
  return response.data;
}

/** Fetch all currently active outages. */
export async function getActiveOutages(): Promise<OutageResponse[]> {
  const response = await request<ApiResponseEnvelope<OutageResponse[]>>(
    '/api/v1/outages?state=active',
  );
  return response.data;
}

/** Fetch a single outage by ID. */
export async function getOutage(id: string): Promise<OutageDetailResponse> {
  const response = await request<ApiResponseEnvelope<OutageDetailResponse>>(
    `/api/v1/outages/${encodeURIComponent(id)}`,
  );
  return response.data;
}

/** Submit a user report for a service. */
export async function submitReport(data: ReportPayload): Promise<ReportResponse> {
  const response = await request<ApiResponseEnvelope<ReportResponse>>(
    '/api/v1/reports',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
  return response.data;
}

/** Fetch stats summary for the dashboard. */
export async function getStats(): Promise<{
  totalServices: number;
  activeOutages: number;
  reportsToday: number;
}> {
  const response = await request<ApiResponseEnvelope<{
    totalServices: number;
    activeOutages: number;
    reportsToday: number;
  }>>('/api/v1/stats');
  return response.data;
}
