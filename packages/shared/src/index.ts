/**
 * @openpulse/shared
 * Shared types and constants for the OpenPulse platform.
 */

// Types
export type {
  Service,
  ServiceCategory,
  ServiceRegion,
  ServiceEndpoint,
  ServiceSummary,
} from './types/service.js';

export type {
  OutageReport,
  ReportType,
  ReportSubmission,
  ReportAggregation,
} from './types/report.js';

export type {
  Outage,
  OutageState,
  OutageSeverity,
  OutageTimeline,
  OutageSummary,
  DetectionEvent,
  ConfidenceScore,
} from './types/outage.js';

export type {
  Probe,
  ProbeResult,
  ProbeType,
  ProbeStatus,
  ProbeResultAggregation,
  VantagePoint,
} from './types/probe.js';

export type {
  ApiResponse,
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiError,
  ApiErrorDetail,
  ApiResponseMeta,
  PaginationParams,
  PaginatedResponse,
  PaginationMeta,
  CursorPaginationParams,
  CursorPaginatedResponse,
  CursorMeta,
} from './types/api.js';

// Constants
export {
  OutageStateEnum,
  ProbeTypeEnum,
  ProbeStatusEnum,
  OutageSeverityEnum,
  ReportTypeEnum,
  DETECTION_THRESHOLDS,
  PROBE_DEFAULTS,
  RATE_LIMITS,
  PAGINATION_DEFAULTS,
  CONFIDENCE_WEIGHTS,
} from './constants.js';
