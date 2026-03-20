import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SlackSender } from '../channels/slack-sender.js';
import type { NotificationTemplate, SlackConfig } from '../types.js';

function makeTemplate(
  overrides: Partial<NotificationTemplate> = {},
): NotificationTemplate {
  return {
    subject: '[OpenPulse] GitHub - MAJOR_OUTAGE',
    body: 'Service: GitHub\nStatus: MAJOR_OUTAGE\nConfidence: 92%',
    markdown:
      '**GitHub** is now **MAJOR_OUTAGE**\n> Confidence: 92%\n> Regions: US East',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<SlackConfig> = {}): SlackConfig {
  return {
    webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
    ...overrides,
  };
}

describe('SlackSender', () => {
  const sender = new SlackSender();
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Block Kit formatting', () => {
    it('builds message with header, section, and context blocks', () => {
      const template = makeTemplate();
      const payload = sender.buildSlackPayload(makeConfig(), template);
      const blocks = payload['blocks'] as Array<Record<string, unknown>>;

      expect(blocks).toHaveLength(3);
      expect(blocks[0]!['type']).toBe('header');
      expect(blocks[1]!['type']).toBe('section');
      expect(blocks[2]!['type']).toBe('context');
    });

    it('includes service name in header', () => {
      const template = makeTemplate();
      const payload = sender.buildSlackPayload(makeConfig(), template);
      const blocks = payload['blocks'] as Array<Record<string, unknown>>;
      const header = blocks[0] as Record<string, unknown>;
      const text = header['text'] as Record<string, unknown>;

      expect(text['text']).toContain('GitHub');
    });

    it('sets channel when specified in config', () => {
      const template = makeTemplate();
      const payload = sender.buildSlackPayload(
        makeConfig({ channel: '#alerts' }),
        template,
      );

      expect(payload['channel']).toBe('#alerts');
    });

    it('does not set channel when not specified', () => {
      const template = makeTemplate();
      const payload = sender.buildSlackPayload(makeConfig(), template);

      expect(payload['channel']).toBeUndefined();
    });
  });

  describe('color coding', () => {
    it('returns red for MAJOR_OUTAGE', () => {
      expect(sender.colorFromSubject('[OpenPulse] X - MAJOR_OUTAGE')).toBe(
        '#e01e5a',
      );
    });

    it('returns yellow for DEGRADED', () => {
      expect(sender.colorFromSubject('[OpenPulse] X - DEGRADED')).toBe(
        '#ecb22e',
      );
    });

    it('returns green for Recovered', () => {
      expect(sender.colorFromSubject('[OpenPulse] X - Recovered')).toBe(
        '#2eb67d',
      );
    });

    it('returns grey for unknown states', () => {
      expect(sender.colorFromSubject('[OpenPulse] X - SOMETHING')).toBe(
        '#808080',
      );
    });
  });

  describe('sending', () => {
    it('returns success on 200 response', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('ok', { status: 200, statusText: 'OK' }),
      );

      const result = await sender.send(makeConfig(), makeTemplate());

      expect(result.success).toBe(true);
      expect(result.channel).toBe('slack');
      expect(result.deliveredAt).toBeInstanceOf(Date);
    });

    it('handles webhook errors gracefully', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('invalid_token', {
          status: 403,
          statusText: 'Forbidden',
        }),
      );

      const result = await sender.send(makeConfig(), makeTemplate());

      expect(result.success).toBe(false);
      expect(result.error).toContain('403');
    });

    it('handles network errors gracefully', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      vi.spyOn(sender as any, 'backoff').mockResolvedValue(undefined);

      const result = await sender.send(makeConfig(), makeTemplate());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('retries on 500 server error', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          new Response('error', {
            status: 500,
            statusText: 'Internal Server Error',
          }),
        )
        .mockResolvedValueOnce(
          new Response('ok', { status: 200, statusText: 'OK' }),
        );

      vi.spyOn(sender as any, 'backoff').mockResolvedValue(undefined);

      const result = await sender.send(makeConfig(), makeTemplate());

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
    });
  });
});
