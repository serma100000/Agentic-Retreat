import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { WebhookSender } from '../channels/webhook-sender.js';
import type { NotificationPayload, WebhookConfig } from '../types.js';

function makePayload(
  overrides: Partial<NotificationPayload> = {},
): NotificationPayload {
  return {
    id: 'notif-001',
    serviceId: 'svc-github',
    serviceSlug: 'github',
    serviceName: 'GitHub',
    outageState: 'MAJOR_OUTAGE',
    previousState: 'OPERATIONAL',
    confidence: 0.92,
    affectedRegions: ['US East'],
    timestamp: new Date('2026-03-20T14:30:00Z'),
    message: 'API errors detected.',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    url: 'https://hooks.example.com/webhook',
    ...overrides,
  };
}

describe('WebhookSender', () => {
  const sender = new WebhookSender();
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful delivery', () => {
    it('returns success result on 200 response', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('ok', { status: 200, statusText: 'OK' }),
      );

      const result = await sender.send(makeConfig(), makePayload());

      expect(result.success).toBe(true);
      expect(result.channel).toBe('webhook');
      expect(result.retryCount).toBe(0);
      expect(result.deliveredAt).toBeInstanceOf(Date);
    });

    it('sends POST with JSON content type', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('ok', { status: 200, statusText: 'OK' }),
      );

      await sender.send(makeConfig(), makePayload());

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('https://hooks.example.com/webhook');
      expect((opts as RequestInit).method).toBe('POST');
      expect((opts as RequestInit).headers).toHaveProperty(
        'Content-Type',
        'application/json',
      );
    });
  });

  describe('HMAC signature', () => {
    it('computes correct HMAC-SHA256 signature when secret is provided', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('ok', { status: 200, statusText: 'OK' }),
      );

      const secret = 'my-webhook-secret';
      await sender.send(
        makeConfig({ secret }),
        makePayload(),
      );

      const [, opts] = fetchSpy.mock.calls[0]!;
      const headers = (opts as RequestInit).headers as Record<string, string>;
      const body = (opts as RequestInit).body as string;

      const expectedSig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
      expect(headers['X-OpenPulse-Signature']).toBe(expectedSig);
    });

    it('does not include signature header when no secret', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('ok', { status: 200, statusText: 'OK' }),
      );

      await sender.send(makeConfig(), makePayload());

      const [, opts] = fetchSpy.mock.calls[0]!;
      const headers = (opts as RequestInit).headers as Record<string, string>;
      expect(headers['X-OpenPulse-Signature']).toBeUndefined();
    });
  });

  describe('timeout handling', () => {
    it('returns failure result on timeout', async () => {
      fetchSpy.mockImplementation(
        () =>
          new Promise((_, reject) => {
            const err = new DOMException('The operation was aborted', 'AbortError');
            setTimeout(() => reject(err), 10);
          }),
      );

      vi.spyOn(sender as any, 'backoff').mockResolvedValue(undefined);

      const result = await sender.send(makeConfig(), makePayload());

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });

  describe('retry behavior', () => {
    it('retries on 500 server error', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          new Response('error', { status: 500, statusText: 'Internal Server Error' }),
        )
        .mockResolvedValueOnce(
          new Response('ok', { status: 200, statusText: 'OK' }),
        );

      // Stub backoff to avoid actual delay
      vi.spyOn(sender as any, 'backoff').mockResolvedValue(undefined);

      const result = await sender.send(makeConfig(), makePayload());

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 4xx client error', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('bad request', { status: 400, statusText: 'Bad Request' }),
      );

      const result = await sender.send(makeConfig(), makePayload());

      expect(result.success).toBe(false);
      expect(result.error).toContain('400');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 404 not found', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('not found', { status: 404, statusText: 'Not Found' }),
      );

      const result = await sender.send(makeConfig(), makePayload());

      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('gives up after max retries on repeated 500', async () => {
      fetchSpy
        .mockResolvedValue(
          new Response('error', { status: 500, statusText: 'Internal Server Error' }),
        );

      vi.spyOn(sender as any, 'backoff').mockResolvedValue(undefined);

      const result = await sender.send(makeConfig(), makePayload());

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(3);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });
});
