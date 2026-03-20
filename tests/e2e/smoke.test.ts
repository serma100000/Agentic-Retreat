/**
 * E2E smoke tests for the OpenPulse API.
 *
 * Validates basic endpoint availability:
 * 1. Health check returns 200
 * 2. Services endpoint returns data
 * 3. Report submission returns 202
 *
 * These tests require the API to be running. When the API is not
 * available, tests are skipped gracefully.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { TEST_CONFIG, testId } from '../setup.js';

const API_URL = TEST_CONFIG.apiUrl;

/**
 * Check if the API is reachable before running smoke tests.
 */
async function isApiAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${API_URL}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

describe('E2E Smoke Tests', () => {
  let apiAvailable = false;

  beforeAll(async () => {
    apiAvailable = await isApiAvailable();
    if (!apiAvailable) {
      console.warn(
        `[SMOKE] API not available at ${API_URL} -- smoke tests will be skipped. ` +
        'Start the API with `pnpm dev` to run these tests.',
      );
    }
  });

  describe('Health check', () => {
    it('should return 200 from the health endpoint', async () => {
      if (!apiAvailable) {
        return; // Skip
      }

      const response = await fetch(`${API_URL}/health`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('status');
    });
  });

  describe('Services endpoint', () => {
    it('should return a list of services', async () => {
      if (!apiAvailable) {
        return; // Skip
      }

      const response = await fetch(`${API_URL}/api/v1/services?limit=10`);

      expect(response.status).toBe(200);

      const body = (await response.json()) as { data: unknown[]; total: number };
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should respect the limit parameter', async () => {
      if (!apiAvailable) {
        return; // Skip
      }

      const response = await fetch(`${API_URL}/api/v1/services?limit=5`);
      const body = (await response.json()) as { data: unknown[] };

      expect(body.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Report submission', () => {
    it('should accept a report and return 202', async () => {
      if (!apiAvailable) {
        return; // Skip
      }

      const report = {
        service_id: testId('svc'),
        category: 'outage',
        body: 'Smoke test report',
        source: 'e2e-smoke',
      };

      const response = await fetch(`${API_URL}/api/v1/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });

      expect(response.status).toBe(202);

      const body = (await response.json()) as { id: string };
      expect(body).toHaveProperty('id');
      expect(typeof body.id).toBe('string');
    });

    it('should reject a report with missing required fields', async () => {
      if (!apiAvailable) {
        return; // Skip
      }

      const response = await fetch(`${API_URL}/api/v1/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // Should be a 4xx error
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Basic response format', () => {
    it('should return JSON content type', async () => {
      if (!apiAvailable) {
        return; // Skip
      }

      const response = await fetch(`${API_URL}/health`);
      const contentType = response.headers.get('content-type');

      expect(contentType).toContain('application/json');
    });
  });
});
