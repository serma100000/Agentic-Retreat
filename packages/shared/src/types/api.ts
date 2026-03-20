/**
 * API response types for OpenPulse.
 * Standard envelope types for all API responses.
 */

export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: ApiResponseMeta;
}

export interface ApiErrorResponse {
  readonly success: false;
  readonly error: ApiError;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: readonly ApiErrorDetail[];
  readonly requestId?: string;
}

export interface ApiErrorDetail {
  readonly field?: string;
  readonly message: string;
  readonly code: string;
}

export interface ApiResponseMeta {
  readonly requestId: string;
  readonly timestamp: string;
  readonly version: string;
}

export interface PaginationParams {
  readonly page: number;
  readonly limit: number;
  readonly sortBy?: string;
  readonly sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  readonly items: readonly T[];
  readonly pagination: PaginationMeta;
}

export interface PaginationMeta {
  readonly page: number;
  readonly limit: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
}

export interface CursorPaginationParams {
  readonly cursor?: string;
  readonly limit: number;
  readonly direction?: 'forward' | 'backward';
}

export interface CursorPaginatedResponse<T> {
  readonly items: readonly T[];
  readonly cursor: CursorMeta;
}

export interface CursorMeta {
  readonly next: string | null;
  readonly prev: string | null;
  readonly hasMore: boolean;
}
