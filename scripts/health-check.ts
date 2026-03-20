#!/usr/bin/env node
/**
 * Health check script for OpenPulse infrastructure.
 *
 * Verifies that all required services are running and healthy:
 * - PostgreSQL database
 * - Redis cache
 * - Kafka message broker
 * - API server
 * - Web frontend
 *
 * Exit 0 if all healthy, exit 1 with details if any failing.
 *
 * Usage: npx tsx scripts/health-check.ts [--timeout <ms>] [--verbose]
 */

import { createConnection, type Socket } from 'node:net';

interface HealthCheckConfig {
  timeout: number;
  verbose: boolean;
  apiUrl: string;
  webUrl: string;
  dbHost: string;
  dbPort: number;
  redisHost: string;
  redisPort: number;
  kafkaHost: string;
  kafkaPort: number;
}

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unreachable';
  latencyMs: number;
  message: string;
  details?: Record<string, unknown>;
}

function parseArgs(): HealthCheckConfig {
  const args = process.argv.slice(2);
  const config: HealthCheckConfig = {
    timeout: 5000,
    verbose: false,
    apiUrl: process.env['API_URL'] ?? 'http://localhost:3000',
    webUrl: process.env['WEB_URL'] ?? 'http://localhost:3001',
    dbHost: process.env['DB_HOST'] ?? 'localhost',
    dbPort: parseInt(process.env['DB_PORT'] ?? '5432', 10),
    redisHost: process.env['REDIS_HOST'] ?? 'localhost',
    redisPort: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    kafkaHost: process.env['KAFKA_HOST'] ?? 'localhost',
    kafkaPort: parseInt(process.env['KAFKA_PORT'] ?? '9092', 10),
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--timeout':
        config.timeout = parseInt(args[++i] ?? '5000', 10);
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--api-url':
        config.apiUrl = args[++i] ?? config.apiUrl;
        break;
      case '--web-url':
        config.webUrl = args[++i] ?? config.webUrl;
        break;
      case '--help':
        console.log(`Usage: health-check.ts [options]

Options:
  --timeout <ms>     Connection timeout (default: 5000)
  --verbose          Show detailed output
  --api-url <url>    API server URL (default: http://localhost:3000)
  --web-url <url>    Web frontend URL (default: http://localhost:3001)
  --help             Show this help

Environment variables:
  API_URL, WEB_URL, DB_HOST, DB_PORT, REDIS_HOST, REDIS_PORT, KAFKA_HOST, KAFKA_PORT`);
        process.exit(0);
    }
  }

  return config;
}

async function checkTcpPort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<{ connected: boolean; latencyMs: number }> {
  const start = performance.now();

  return new Promise(resolve => {
    const socket: Socket = createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ connected: false, latencyMs: performance.now() - start });
    }, timeoutMs);

    socket.on('connect', () => {
      clearTimeout(timer);
      const latencyMs = performance.now() - start;
      socket.destroy();
      resolve({ connected: true, latencyMs });
    });

    socket.on('error', () => {
      clearTimeout(timer);
      resolve({ connected: false, latencyMs: performance.now() - start });
    });
  });
}

async function checkHttpEndpoint(
  url: string,
  path: string,
  timeoutMs: number,
): Promise<{ ok: boolean; statusCode: number; latencyMs: number; body?: string }> {
  const start = performance.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${url}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timer);
    const latencyMs = performance.now() - start;
    let body: string | undefined;

    try {
      body = await response.text();
    } catch {
      // ignore body read errors
    }

    return {
      ok: response.ok,
      statusCode: response.status,
      latencyMs,
      body,
    };
  } catch {
    return {
      ok: false,
      statusCode: 0,
      latencyMs: performance.now() - start,
    };
  }
}

async function checkDatabase(config: HealthCheckConfig): Promise<ServiceHealth> {
  const start = performance.now();
  const result = await checkTcpPort(config.dbHost, config.dbPort, config.timeout);

  if (result.connected) {
    return {
      name: 'PostgreSQL',
      status: 'healthy',
      latencyMs: result.latencyMs,
      message: `Connected to ${config.dbHost}:${config.dbPort}`,
      details: { host: config.dbHost, port: config.dbPort },
    };
  }

  return {
    name: 'PostgreSQL',
    status: 'unreachable',
    latencyMs: performance.now() - start,
    message: `Cannot connect to ${config.dbHost}:${config.dbPort}`,
    details: { host: config.dbHost, port: config.dbPort },
  };
}

async function checkRedis(config: HealthCheckConfig): Promise<ServiceHealth> {
  const start = performance.now();
  const result = await checkTcpPort(config.redisHost, config.redisPort, config.timeout);

  if (result.connected) {
    return {
      name: 'Redis',
      status: 'healthy',
      latencyMs: result.latencyMs,
      message: `Connected to ${config.redisHost}:${config.redisPort}`,
      details: { host: config.redisHost, port: config.redisPort },
    };
  }

  return {
    name: 'Redis',
    status: 'unreachable',
    latencyMs: performance.now() - start,
    message: `Cannot connect to ${config.redisHost}:${config.redisPort}`,
    details: { host: config.redisHost, port: config.redisPort },
  };
}

async function checkKafka(config: HealthCheckConfig): Promise<ServiceHealth> {
  const start = performance.now();
  const result = await checkTcpPort(config.kafkaHost, config.kafkaPort, config.timeout);

  if (result.connected) {
    return {
      name: 'Kafka',
      status: 'healthy',
      latencyMs: result.latencyMs,
      message: `Connected to ${config.kafkaHost}:${config.kafkaPort}`,
      details: { host: config.kafkaHost, port: config.kafkaPort },
    };
  }

  return {
    name: 'Kafka',
    status: 'unreachable',
    latencyMs: performance.now() - start,
    message: `Cannot connect to ${config.kafkaHost}:${config.kafkaPort}`,
    details: { host: config.kafkaHost, port: config.kafkaPort },
  };
}

async function checkApi(config: HealthCheckConfig): Promise<ServiceHealth> {
  const result = await checkHttpEndpoint(config.apiUrl, '/health', config.timeout);

  if (result.ok) {
    let details: Record<string, unknown> | undefined;
    if (result.body) {
      try {
        details = JSON.parse(result.body) as Record<string, unknown>;
      } catch {
        // not JSON
      }
    }

    return {
      name: 'API Server',
      status: 'healthy',
      latencyMs: result.latencyMs,
      message: `API responding at ${config.apiUrl} (HTTP ${result.statusCode})`,
      details,
    };
  }

  if (result.statusCode > 0) {
    return {
      name: 'API Server',
      status: 'unhealthy',
      latencyMs: result.latencyMs,
      message: `API returned HTTP ${result.statusCode} at ${config.apiUrl}`,
      details: { statusCode: result.statusCode },
    };
  }

  return {
    name: 'API Server',
    status: 'unreachable',
    latencyMs: result.latencyMs,
    message: `Cannot connect to API at ${config.apiUrl}`,
  };
}

async function checkWeb(config: HealthCheckConfig): Promise<ServiceHealth> {
  const result = await checkHttpEndpoint(config.webUrl, '/', config.timeout);

  if (result.ok) {
    return {
      name: 'Web Frontend',
      status: 'healthy',
      latencyMs: result.latencyMs,
      message: `Web responding at ${config.webUrl} (HTTP ${result.statusCode})`,
    };
  }

  if (result.statusCode > 0) {
    return {
      name: 'Web Frontend',
      status: 'unhealthy',
      latencyMs: result.latencyMs,
      message: `Web returned HTTP ${result.statusCode} at ${config.webUrl}`,
      details: { statusCode: result.statusCode },
    };
  }

  return {
    name: 'Web Frontend',
    status: 'unreachable',
    latencyMs: result.latencyMs,
    message: `Cannot connect to web at ${config.webUrl}`,
  };
}

function formatStatus(status: string): string {
  switch (status) {
    case 'healthy':
      return '\x1b[32mHEALTHY\x1b[0m';
    case 'unhealthy':
      return '\x1b[33mUNHEALTHY\x1b[0m';
    case 'unreachable':
      return '\x1b[31mUNREACHABLE\x1b[0m';
    default:
      return status;
  }
}

async function main(): Promise<void> {
  const config = parseArgs();

  console.log('OpenPulse Health Check');
  console.log('=====================\n');

  if (config.verbose) {
    console.log('Configuration:');
    console.log(`  API URL:    ${config.apiUrl}`);
    console.log(`  Web URL:    ${config.webUrl}`);
    console.log(`  DB:         ${config.dbHost}:${config.dbPort}`);
    console.log(`  Redis:      ${config.redisHost}:${config.redisPort}`);
    console.log(`  Kafka:      ${config.kafkaHost}:${config.kafkaPort}`);
    console.log(`  Timeout:    ${config.timeout}ms`);
    console.log('');
  }

  const checks = await Promise.all([
    checkDatabase(config),
    checkRedis(config),
    checkKafka(config),
    checkApi(config),
    checkWeb(config),
  ]);

  const nameWidth = 16;
  const statusWidth = 20;

  console.log(
    'Service'.padEnd(nameWidth) +
    'Status'.padEnd(statusWidth) +
    'Latency'.padEnd(12) +
    'Message',
  );
  console.log('-'.repeat(72));

  for (const check of checks) {
    const latency = check.latencyMs < 1
      ? `${(check.latencyMs * 1000).toFixed(0)}us`
      : `${check.latencyMs.toFixed(0)}ms`;

    console.log(
      check.name.padEnd(nameWidth) +
      formatStatus(check.status).padEnd(statusWidth + 9) + // account for ANSI codes
      latency.padEnd(12) +
      check.message,
    );

    if (config.verbose && check.details) {
      for (const [key, value] of Object.entries(check.details)) {
        console.log(`${''.padEnd(nameWidth)}  ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  const healthy = checks.filter(c => c.status === 'healthy');
  const unhealthy = checks.filter(c => c.status !== 'healthy');

  console.log(`\nSummary: ${healthy.length}/${checks.length} services healthy`);

  if (unhealthy.length > 0) {
    console.log('\nFailing services:');
    for (const service of unhealthy) {
      console.log(`  - ${service.name}: ${service.message}`);
    }
    console.log('\nHealth check FAILED');
    process.exit(1);
  } else {
    console.log('\nAll services healthy');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error during health check:', err);
  process.exit(1);
});
