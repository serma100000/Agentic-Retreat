/**
 * DNS active probe.
 *
 * Resolves A and AAAA records against multiple DNS servers
 * (Google 8.8.8.8, Cloudflare 1.1.1.1, system resolver) and
 * measures resolution time for each.
 */

import { randomUUID } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import type { ProbeConfig, ProbeResult } from './types.js';

const DEFAULT_DNS_SERVERS = ['8.8.8.8', '1.1.1.1'];

interface DnsServerResult {
  server: string;
  addresses: string[];
  duration_ms: number;
  error?: string;
}

async function resolveWithServer(
  hostname: string,
  server: string,
  timeoutMs: number,
): Promise<DnsServerResult> {
  const resolver = new Resolver();
  resolver.setServers([server]);

  const start = performance.now();
  const addresses: string[] = [];
  let error: string | undefined;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Resolve A records
    try {
      const ipv4 = await resolver.resolve4(hostname);
      addresses.push(...ipv4);
    } catch {
      // A records may not exist; that's ok
    }

    // Resolve AAAA records
    try {
      const ipv6 = await resolver.resolve6(hostname);
      addresses.push(...ipv6);
    } catch {
      // AAAA records may not exist; that's ok
    }

    clearTimeout(timeoutId);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return {
    server,
    addresses,
    duration_ms: Math.round((performance.now() - start) * 100) / 100,
    error,
  };
}

async function resolveWithSystemResolver(
  hostname: string,
  timeoutMs: number,
): Promise<DnsServerResult> {
  const resolver = new Resolver();
  const start = performance.now();
  const addresses: string[] = [];
  let error: string | undefined;

  try {
    const timeoutId = setTimeout(() => {
      resolver.cancel();
    }, timeoutMs);

    try {
      const ipv4 = await resolver.resolve4(hostname);
      addresses.push(...ipv4);
    } catch {
      // A records may not exist
    }

    try {
      const ipv6 = await resolver.resolve6(hostname);
      addresses.push(...ipv6);
    } catch {
      // AAAA records may not exist
    }

    clearTimeout(timeoutId);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return {
    server: 'system',
    addresses,
    duration_ms: Math.round((performance.now() - start) * 100) / 100,
    error,
  };
}

export async function dnsProbe(config: ProbeConfig, region: string): Promise<ProbeResult> {
  const probeId = randomUUID();
  const timestamp = new Date();
  const overallStart = performance.now();

  // Extract hostname from target (may be URL or bare hostname)
  let hostname: string;
  try {
    const url = new URL(config.target);
    hostname = url.hostname;
  } catch {
    hostname = config.target;
  }

  const dnsServers = config.dns_servers ?? DEFAULT_DNS_SERVERS;

  // Resolve against each DNS server in parallel plus system resolver
  const results = await Promise.all([
    ...dnsServers.map((server) => resolveWithServer(hostname, server, config.timeout_ms)),
    resolveWithSystemResolver(hostname, config.timeout_ms),
  ]);

  const totalMs = performance.now() - overallStart;

  // Aggregate all resolved addresses (unique)
  const allAddresses = [...new Set(results.flatMap((r) => r.addresses))];

  // Use the fastest successful resolution time as latency
  const successfulResults = results.filter((r) => r.addresses.length > 0 && !r.error);
  const fastestMs =
    successfulResults.length > 0
      ? Math.min(...successfulResults.map((r) => r.duration_ms))
      : totalMs;

  const hasAnyAddress = allAddresses.length > 0;
  const errors = results.filter((r) => r.error).map((r) => `${r.server}: ${r.error!}`);

  return {
    probe_id: probeId,
    service_id: config.service_id,
    probe_type: 'dns',
    target: hostname,
    success: hasAnyAddress,
    latency_ms: Math.round(fastestMs * 100) / 100,
    timing: {
      dns_lookup_ms: Math.round(fastestMs * 100) / 100,
      tcp_connect_ms: 0,
      tls_handshake_ms: 0,
      ttfb_ms: 0,
      total_ms: Math.round(totalMs * 100) / 100,
    },
    resolved_addresses: allAddresses,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    region,
    timestamp,
  };
}
