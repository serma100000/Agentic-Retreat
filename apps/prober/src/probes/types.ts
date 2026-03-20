/**
 * Types for the OpenPulse active prober.
 *
 * Designed with a clear separation between probe configuration,
 * execution context, and result reporting to facilitate a future Rust port.
 */

export const ProbeType = {
  HTTP: 'http',
  HTTPS: 'https',
  TCP: 'tcp',
  DNS: 'dns',
} as const;

export type ProbeTypeValue = (typeof ProbeType)[keyof typeof ProbeType];

export interface ProbeConfig {
  /** Unique service identifier. */
  service_id: string;
  /** Human-readable service name. */
  service_name: string;
  /** The type of probe to execute. */
  probe_type: ProbeTypeValue;
  /** Target URL or hostname. */
  target: string;
  /** Port for TCP probes (defaults based on probe type). */
  port?: number;
  /** Probe interval in milliseconds (default 30000). */
  interval_ms: number;
  /** Request timeout in milliseconds (default 10000). */
  timeout_ms: number;
  /** Expected HTTP status code for HTTP/HTTPS probes. */
  expected_status?: number;
  /** Custom HTTP headers to send. */
  headers?: Record<string, string>;
  /** DNS servers to use for DNS probes. */
  dns_servers?: string[];
}

export interface TimingBreakdown {
  /** DNS lookup duration in milliseconds. */
  dns_lookup_ms: number;
  /** TCP connection duration in milliseconds. */
  tcp_connect_ms: number;
  /** TLS handshake duration in milliseconds. */
  tls_handshake_ms: number;
  /** Time to first byte in milliseconds. */
  ttfb_ms: number;
  /** Total request duration in milliseconds. */
  total_ms: number;
}

export interface TlsInfo {
  /** Whether TLS is active. */
  enabled: boolean;
  /** TLS protocol version (e.g., "TLSv1.3"). */
  protocol?: string;
  /** Certificate expiry date. */
  cert_expiry?: Date;
  /** Days until certificate expires. */
  days_until_expiry?: number;
}

export interface ProbeResult {
  /** Unique probe execution identifier. */
  probe_id: string;
  /** Service being probed. */
  service_id: string;
  /** Type of probe executed. */
  probe_type: ProbeTypeValue;
  /** Target that was probed. */
  target: string;
  /** Whether the probe succeeded. */
  success: boolean;
  /** HTTP status code (for HTTP/HTTPS probes). */
  status_code?: number;
  /** Total latency in milliseconds. */
  latency_ms: number;
  /** Detailed timing breakdown. */
  timing?: TimingBreakdown;
  /** TLS certificate information. */
  tls_info?: TlsInfo;
  /** Response headers (selected). */
  response_headers?: Record<string, string>;
  /** DNS resolved addresses (for DNS probes). */
  resolved_addresses?: string[];
  /** Error message if probe failed. */
  error?: string;
  /** Region where probe was executed. */
  region: string;
  /** Timestamp of probe execution. */
  timestamp: Date;
}

export interface ServiceCatalogEntry {
  id: string;
  name: string;
  url: string;
  probe_type?: ProbeTypeValue;
  probe_interval_ms?: number;
  probe_timeout_ms?: number;
  expected_status?: number;
  port?: number;
  headers?: Record<string, string>;
  dns_servers?: string[];
}

export interface ServiceCatalogResponse {
  data: ServiceCatalogEntry[];
  total: number;
}
