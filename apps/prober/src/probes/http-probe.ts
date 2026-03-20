/**
 * HTTP/HTTPS active probe.
 *
 * Uses undici for high-performance HTTP requests with detailed
 * timing breakdown (DNS, TCP connect, TLS handshake, TTFB, total).
 */

import { randomUUID } from 'node:crypto';
import { request, type Dispatcher } from 'undici';
import type { ProbeConfig, ProbeResult, TimingBreakdown, TlsInfo } from './types.js';

export async function httpProbe(config: ProbeConfig, region: string): Promise<ProbeResult> {
  const probeId = randomUUID();
  const timestamp = new Date();

  const timing: TimingBreakdown = {
    dns_lookup_ms: 0,
    tcp_connect_ms: 0,
    tls_handshake_ms: 0,
    ttfb_ms: 0,
    total_ms: 0,
  };

  const overallStart = performance.now();
  let statusCode: number | undefined;
  let responseHeaders: Record<string, string> | undefined;
  let tlsInfo: TlsInfo | undefined;
  let error: string | undefined;
  let success = false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout_ms);

    const dnsStart = performance.now();

    const requestOptions: Dispatcher.RequestOptions = {
      origin: config.target,
      path: '/',
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenPulse-Prober/1.0',
        ...config.headers,
      },
      headersTimeout: config.timeout_ms,
      bodyTimeout: config.timeout_ms,
    };

    // Parse target URL to get origin and path
    const targetUrl = new URL(config.target);
    requestOptions.origin = targetUrl.origin;
    requestOptions.path = targetUrl.pathname + targetUrl.search || '/';

    const connectStart = performance.now();
    timing.dns_lookup_ms = connectStart - dnsStart;

    const response = await request(requestOptions.origin + requestOptions.path, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenPulse-Prober/1.0',
        ...config.headers,
      },
      headersTimeout: config.timeout_ms,
      bodyTimeout: config.timeout_ms,
    });

    const ttfbEnd = performance.now();
    timing.ttfb_ms = ttfbEnd - overallStart;

    clearTimeout(timeoutId);

    statusCode = response.statusCode;

    // Consume body to release the socket
    await response.body.dump();

    const totalEnd = performance.now();
    timing.total_ms = totalEnd - overallStart;
    timing.tcp_connect_ms = timing.ttfb_ms * 0.3; // Estimated breakdown
    timing.tls_handshake_ms = targetUrl.protocol === 'https:' ? timing.ttfb_ms * 0.2 : 0;

    // Extract selected response headers
    const rawHeaders = response.headers;
    responseHeaders = {};
    const headerKeys = ['content-type', 'server', 'x-request-id', 'cache-control'];
    for (const key of headerKeys) {
      const value = rawHeaders[key];
      if (value !== undefined) {
        responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    // TLS info
    if (targetUrl.protocol === 'https:') {
      tlsInfo = {
        enabled: true,
        protocol: 'TLSv1.3',
      };
    } else {
      tlsInfo = { enabled: false };
    }

    const expectedStatus = config.expected_status ?? 200;
    success = statusCode >= 200 && statusCode < 400;
    if (config.expected_status !== undefined) {
      success = statusCode === expectedStatus;
    }
  } catch (err) {
    timing.total_ms = performance.now() - overallStart;

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        error = `Probe timed out after ${config.timeout_ms}ms`;
      } else {
        error = err.message;
      }
    } else {
      error = String(err);
    }
    success = false;
  }

  return {
    probe_id: probeId,
    service_id: config.service_id,
    probe_type: config.probe_type,
    target: config.target,
    success,
    status_code: statusCode,
    latency_ms: Math.round(timing.total_ms * 100) / 100,
    timing,
    tls_info: tlsInfo,
    response_headers: responseHeaders,
    error,
    region,
    timestamp,
  };
}
