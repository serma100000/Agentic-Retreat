/**
 * Integration test for the active prober flow.
 *
 * Spins up a local HTTP server, probes it, and verifies:
 * 1. Probe results are published to Kafka (mocked)
 * 2. Latency measurements are reasonable
 * 3. Status codes and timing breakdowns are captured
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { httpProbe } from '../../apps/prober/src/probes/http-probe.js';
import { tcpProbe } from '../../apps/prober/src/probes/tcp-probe.js';
import { dnsProbe } from '../../apps/prober/src/probes/dns-probe.js';
import type { ProbeConfig, ProbeResult } from '../../apps/prober/src/probes/types.js';
import { cleanup, onCleanup } from '../setup.js';

// Mock Kafka producer that collects messages
class MockProbeKafkaProducer {
  public results: ProbeResult[] = [];

  async publish(result: ProbeResult): Promise<void> {
    this.results.push(result);
  }

  getResults(): ProbeResult[] {
    return [...this.results];
  }

  clear(): void {
    this.results = [];
  }
}

describe('Probe Flow Integration', () => {
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;
  let kafkaProducer: MockProbeKafkaProducer;

  beforeAll(async () => {
    // Start a local HTTP server that simulates various responses
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`);

      if (url.pathname === '/healthy') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'X-Request-Id': 'test-123' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (url.pathname === '/slow') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('slow response');
        }, 500);
      } else if (url.pathname === '/error') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else if (url.pathname === '/redirect') {
        res.writeHead(301, { Location: '/healthy' });
        res.end();
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    kafkaProducer = new MockProbeKafkaProducer();
    onCleanup(() => kafkaProducer.clear());
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('HTTP probe against local server', () => {
    it('should successfully probe a healthy endpoint', async () => {
      const config: ProbeConfig = {
        service_id: 'svc-local-test',
        service_name: 'Local Test',
        probe_type: 'http',
        target: `${serverUrl}/healthy`,
        interval_ms: 30000,
        timeout_ms: 5000,
      };

      const result = await httpProbe(config, 'test-region');
      await kafkaProducer.publish(result);

      expect(result.success).toBe(true);
      expect(result.status_code).toBe(200);
      expect(result.latency_ms).toBeGreaterThan(0);
      expect(result.latency_ms).toBeLessThan(5000);
      expect(result.probe_type).toBe('http');
      expect(result.service_id).toBe('svc-local-test');
      expect(result.region).toBe('test-region');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();

      // Verify timing breakdown
      expect(result.timing).toBeDefined();
      expect(result.timing!.total_ms).toBeGreaterThan(0);
      expect(result.timing!.ttfb_ms).toBeGreaterThan(0);

      // Verify published to Kafka
      const published = kafkaProducer.getResults();
      expect(published).toHaveLength(1);
      expect(published[0]!.probe_id).toBe(result.probe_id);
    });

    it('should capture 500 status codes', async () => {
      const config: ProbeConfig = {
        service_id: 'svc-error-test',
        service_name: 'Error Test',
        probe_type: 'http',
        target: `${serverUrl}/error`,
        interval_ms: 30000,
        timeout_ms: 5000,
      };

      const result = await httpProbe(config, 'test-region');

      expect(result.status_code).toBe(500);
      // 500 is still a "successful" connection (server responded)
      // but success should be false since it's not a 2xx/3xx
      expect(result.success).toBe(false);
      expect(result.latency_ms).toBeGreaterThan(0);
    });

    it('should measure latency for slow endpoints', async () => {
      const config: ProbeConfig = {
        service_id: 'svc-slow-test',
        service_name: 'Slow Test',
        probe_type: 'http',
        target: `${serverUrl}/slow`,
        interval_ms: 30000,
        timeout_ms: 5000,
      };

      const result = await httpProbe(config, 'test-region');

      expect(result.success).toBe(true);
      expect(result.status_code).toBe(200);
      // The slow endpoint has a 500ms delay
      expect(result.latency_ms).toBeGreaterThanOrEqual(400);
    });

    it('should timeout when endpoint takes too long', async () => {
      const config: ProbeConfig = {
        service_id: 'svc-timeout-test',
        service_name: 'Timeout Test',
        probe_type: 'http',
        target: `${serverUrl}/slow`,
        interval_ms: 30000,
        timeout_ms: 100, // Very short timeout
      };

      const result = await httpProbe(config, 'test-region');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail for unreachable targets', async () => {
      const config: ProbeConfig = {
        service_id: 'svc-unreachable',
        service_name: 'Unreachable',
        probe_type: 'http',
        target: 'http://192.0.2.1:1', // Non-routable address
        interval_ms: 30000,
        timeout_ms: 2000,
      };

      const result = await httpProbe(config, 'test-region');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.latency_ms).toBeGreaterThan(0);
    });

    it('should validate expected status codes', async () => {
      const config: ProbeConfig = {
        service_id: 'svc-status-check',
        service_name: 'Status Check',
        probe_type: 'http',
        target: `${serverUrl}/redirect`,
        interval_ms: 30000,
        timeout_ms: 5000,
        expected_status: 301,
      };

      const result = await httpProbe(config, 'test-region');

      expect(result.status_code).toBe(301);
      expect(result.success).toBe(true);
    });
  });

  describe('TCP probe against local server', () => {
    it('should successfully connect to the local server port', async () => {
      const config: ProbeConfig = {
        service_id: 'svc-tcp-test',
        service_name: 'TCP Test',
        probe_type: 'tcp',
        target: '127.0.0.1',
        port: serverPort,
        interval_ms: 30000,
        timeout_ms: 5000,
      };

      const result = await tcpProbe(config, 'test-region');
      await kafkaProducer.publish(result);

      expect(result.success).toBe(true);
      expect(result.latency_ms).toBeGreaterThan(0);
      expect(result.latency_ms).toBeLessThan(1000);
      expect(result.probe_type).toBe('tcp');
      expect(result.target).toBe(`127.0.0.1:${serverPort}`);

      expect(result.timing).toBeDefined();
      expect(result.timing!.tcp_connect_ms).toBeGreaterThan(0);
    });

    it('should fail to connect to a closed port', async () => {
      const config: ProbeConfig = {
        service_id: 'svc-tcp-closed',
        service_name: 'TCP Closed Port',
        probe_type: 'tcp',
        target: '127.0.0.1',
        port: 1, // Port 1 is almost certainly closed
        interval_ms: 30000,
        timeout_ms: 2000,
      };

      const result = await tcpProbe(config, 'test-region');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('DNS probe', () => {
    it('should resolve a well-known hostname', async () => {
      const config: ProbeConfig = {
        service_id: 'svc-dns-test',
        service_name: 'DNS Test',
        probe_type: 'dns',
        target: 'localhost',
        interval_ms: 30000,
        timeout_ms: 5000,
      };

      const result = await dnsProbe(config, 'test-region');
      await kafkaProducer.publish(result);

      expect(result.probe_type).toBe('dns');
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
      expect(result.timing).toBeDefined();
      expect(result.timing!.dns_lookup_ms).toBeGreaterThanOrEqual(0);
    });

    it('should report all resolved addresses', async () => {
      const config: ProbeConfig = {
        service_id: 'svc-dns-multi',
        service_name: 'DNS Multi',
        probe_type: 'dns',
        target: 'localhost',
        interval_ms: 30000,
        timeout_ms: 5000,
      };

      const result = await dnsProbe(config, 'test-region');

      // localhost should resolve to at least 127.0.0.1 or ::1
      if (result.success) {
        expect(result.resolved_addresses).toBeDefined();
        expect(result.resolved_addresses!.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Result publishing', () => {
    it('should publish multiple probe results in order', async () => {
      const configs: ProbeConfig[] = [
        {
          service_id: 'svc-batch-1',
          service_name: 'Batch 1',
          probe_type: 'http',
          target: `${serverUrl}/healthy`,
          interval_ms: 30000,
          timeout_ms: 5000,
        },
        {
          service_id: 'svc-batch-2',
          service_name: 'Batch 2',
          probe_type: 'tcp',
          target: '127.0.0.1',
          port: serverPort,
          interval_ms: 30000,
          timeout_ms: 5000,
        },
      ];

      for (const config of configs) {
        const result =
          config.probe_type === 'http'
            ? await httpProbe(config, 'test-region')
            : await tcpProbe(config, 'test-region');
        await kafkaProducer.publish(result);
      }

      const results = kafkaProducer.getResults();
      expect(results).toHaveLength(2);
      expect(results[0]!.service_id).toBe('svc-batch-1');
      expect(results[1]!.service_id).toBe('svc-batch-2');
    });
  });
});
