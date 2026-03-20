/**
 * TCP active probe.
 *
 * Opens a TCP connection to host:port, measures the connection
 * establishment time, and immediately closes the socket.
 */

import { randomUUID } from 'node:crypto';
import * as net from 'node:net';
import type { ProbeConfig, ProbeResult } from './types.js';

export function tcpProbe(config: ProbeConfig, region: string): Promise<ProbeResult> {
  const probeId = randomUUID();
  const timestamp = new Date();

  // Extract host and port from target
  let host: string;
  let port: number;

  try {
    const url = new URL(config.target);
    host = url.hostname;
    port = config.port ?? (url.port ? parseInt(url.port, 10) : 80);
  } catch {
    // Treat as host:port or bare hostname
    const parts = config.target.split(':');
    host = parts[0] ?? config.target;
    port = config.port ?? (parts[1] ? parseInt(parts[1], 10) : 80);
  }

  return new Promise<ProbeResult>((resolve) => {
    const start = performance.now();
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();

      resolve({
        probe_id: probeId,
        service_id: config.service_id,
        probe_type: 'tcp',
        target: `${host}:${port}`,
        success: false,
        latency_ms: config.timeout_ms,
        timing: {
          dns_lookup_ms: 0,
          tcp_connect_ms: config.timeout_ms,
          tls_handshake_ms: 0,
          ttfb_ms: 0,
          total_ms: config.timeout_ms,
        },
        error: `TCP connection timed out after ${config.timeout_ms}ms`,
        region,
        timestamp,
      });
    }, config.timeout_ms);

    const socket = net.createConnection({ host, port }, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);

      const connectMs = performance.now() - start;
      socket.destroy();

      resolve({
        probe_id: probeId,
        service_id: config.service_id,
        probe_type: 'tcp',
        target: `${host}:${port}`,
        success: true,
        latency_ms: Math.round(connectMs * 100) / 100,
        timing: {
          dns_lookup_ms: 0,
          tcp_connect_ms: Math.round(connectMs * 100) / 100,
          tls_handshake_ms: 0,
          ttfb_ms: 0,
          total_ms: Math.round(connectMs * 100) / 100,
        },
        region,
        timestamp,
      });
    });

    socket.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);

      const totalMs = performance.now() - start;
      socket.destroy();

      resolve({
        probe_id: probeId,
        service_id: config.service_id,
        probe_type: 'tcp',
        target: `${host}:${port}`,
        success: false,
        latency_ms: Math.round(totalMs * 100) / 100,
        timing: {
          dns_lookup_ms: 0,
          tcp_connect_ms: Math.round(totalMs * 100) / 100,
          tls_handshake_ms: 0,
          ttfb_ms: 0,
          total_ms: Math.round(totalMs * 100) / 100,
        },
        error: err.message,
        region,
        timestamp,
      });
    });
  });
}
