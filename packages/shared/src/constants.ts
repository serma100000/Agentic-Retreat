/**
 * Shared constants for OpenPulse.
 * Enums, default thresholds, and rate limits.
 */

export const OutageStateEnum = {
  Suspected: 'suspected',
  Confirmed: 'confirmed',
  Monitoring: 'monitoring',
  Resolving: 'resolving',
  Resolved: 'resolved',
} as const;

export const ProbeTypeEnum = {
  Http: 'http',
  Tcp: 'tcp',
  Icmp: 'icmp',
  Dns: 'dns',
  Tls: 'tls',
} as const;

export const ProbeStatusEnum = {
  Healthy: 'healthy',
  Degraded: 'degraded',
  Unhealthy: 'unhealthy',
  Timeout: 'timeout',
  Error: 'error',
} as const;

export const OutageSeverityEnum = {
  Minor: 'minor',
  Moderate: 'moderate',
  Major: 'major',
  Critical: 'critical',
} as const;

export const ReportTypeEnum = {
  Outage: 'outage',
  Degraded: 'degraded',
  Intermittent: 'intermittent',
  Resolved: 'resolved',
} as const;

/**
 * Default thresholds for outage detection.
 */
export const DETECTION_THRESHOLDS = {
  /** Minimum confidence score to flag as suspected outage */
  SUSPECTED_MIN_CONFIDENCE: 0.3,
  /** Minimum confidence score to confirm an outage */
  CONFIRMED_MIN_CONFIDENCE: 0.7,
  /** Minimum number of user reports to trigger investigation */
  MIN_REPORTS_FOR_INVESTIGATION: 3,
  /** Minimum number of failed probes from distinct vantage points */
  MIN_FAILED_PROBES: 2,
  /** Time window in ms for correlating probe failures */
  PROBE_CORRELATION_WINDOW_MS: 60_000,
  /** Time window in ms for correlating user reports */
  REPORT_CORRELATION_WINDOW_MS: 300_000,
  /** Time in ms after last failure before marking as resolving */
  RESOLVING_COOLDOWN_MS: 300_000,
  /** Time in ms in resolving state before marking as resolved */
  RESOLVED_COOLDOWN_MS: 600_000,
} as const;

/**
 * Default probe configuration.
 */
export const PROBE_DEFAULTS = {
  /** Default interval between probes in ms */
  INTERVAL_MS: 30_000,
  /** Default timeout for probe requests in ms */
  TIMEOUT_MS: 10_000,
  /** Default number of retries on failure */
  RETRIES: 2,
  /** Maximum concurrent probes per vantage point */
  MAX_CONCURRENT_PER_VP: 50,
} as const;

/**
 * API rate limits (requests per window).
 */
export const RATE_LIMITS = {
  /** Public API: requests per minute */
  PUBLIC_API_RPM: 60,
  /** Report submission: requests per minute per IP */
  REPORT_SUBMISSION_RPM: 10,
  /** Authenticated API: requests per minute */
  AUTHENTICATED_API_RPM: 300,
  /** WebSocket connections per IP */
  WEBSOCKET_CONNECTIONS_PER_IP: 5,
  /** Rate limit window in ms */
  WINDOW_MS: 60_000,
} as const;

/**
 * Pagination defaults.
 */
export const PAGINATION_DEFAULTS = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

/**
 * Confidence score weights for outage detection.
 */
export const CONFIDENCE_WEIGHTS = {
  /** Weight of probe results in confidence calculation */
  PROBE: 0.5,
  /** Weight of user reports in confidence calculation */
  REPORT: 0.3,
  /** Weight of ML predictions in confidence calculation */
  ML: 0.2,
} as const;
