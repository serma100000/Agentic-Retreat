import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  NotificationDispatcher,
  type QuietHours,
} from '../notification-dispatcher.js';
import {
  NotificationChannel,
  NotificationPriority,
} from '../types.js';
import type {
  DeliveryResult,
  NotificationChannelType,
  NotificationPayload,
  NotificationPreference,
  NotificationSender,
  SlackConfig,
  WebhookConfig,
  EmailConfig,
} from '../types.js';

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

function makePreference(
  overrides: Partial<NotificationPreference> = {},
): NotificationPreference {
  return {
    userId: 'user-1',
    channel: NotificationChannel.WEBHOOK,
    config: { url: 'https://hooks.example.com/webhook' } satisfies WebhookConfig,
    enabled: true,
    ...overrides,
  };
}

function createMockSender(): NotificationSender {
  return {
    send: vi.fn().mockResolvedValue({
      notificationId: 'notif-001',
      channel: NotificationChannel.WEBHOOK,
      success: true,
      deliveredAt: new Date(),
      retryCount: 0,
    } satisfies DeliveryResult),
  };
}

function createSendersMap(
  ...entries: Array<[NotificationChannelType, NotificationSender]>
): Map<NotificationChannelType, NotificationSender> {
  return new Map(entries);
}

describe('NotificationDispatcher', () => {
  let mockWebhookSender: NotificationSender;
  let mockSlackSender: NotificationSender;
  let mockEmailSender: NotificationSender;

  beforeEach(() => {
    mockWebhookSender = createMockSender();
    mockSlackSender = {
      send: vi.fn().mockResolvedValue({
        notificationId: 'notif-001',
        channel: NotificationChannel.SLACK,
        success: true,
        deliveredAt: new Date(),
        retryCount: 0,
      } satisfies DeliveryResult),
    };
    mockEmailSender = {
      send: vi.fn().mockResolvedValue({
        notificationId: 'notif-001',
        channel: NotificationChannel.EMAIL,
        success: true,
        deliveredAt: new Date(),
        retryCount: 0,
      } satisfies DeliveryResult),
    };
  });

  describe('basic dispatch', () => {
    it('dispatches to all enabled channels for a user', async () => {
      const senders = createSendersMap(
        [NotificationChannel.WEBHOOK, mockWebhookSender],
        [NotificationChannel.SLACK, mockSlackSender],
      );
      const dispatcher = new NotificationDispatcher(senders);

      const prefs = [
        makePreference({
          channel: NotificationChannel.WEBHOOK,
          config: { url: 'https://hooks.example.com' } satisfies WebhookConfig,
        }),
        makePreference({
          channel: NotificationChannel.SLACK,
          config: { webhookUrl: 'https://hooks.slack.com/xxx' } satisfies SlackConfig,
        }),
      ];

      const results = await dispatcher.dispatch(makePayload(), prefs);

      expect(results).toHaveLength(2);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(true);
      expect(mockWebhookSender.send).toHaveBeenCalledTimes(1);
      expect(mockSlackSender.send).toHaveBeenCalledTimes(1);
    });

    it('skips disabled preferences', async () => {
      const senders = createSendersMap(
        [NotificationChannel.WEBHOOK, mockWebhookSender],
      );
      const dispatcher = new NotificationDispatcher(senders);

      const prefs = [makePreference({ enabled: false })];

      const results = await dispatcher.dispatch(makePayload(), prefs);

      expect(results).toHaveLength(0);
      expect(mockWebhookSender.send).not.toHaveBeenCalled();
    });
  });

  describe('service filters', () => {
    it('only notifies for subscribed services', async () => {
      const senders = createSendersMap(
        [NotificationChannel.WEBHOOK, mockWebhookSender],
      );
      const dispatcher = new NotificationDispatcher(senders);

      const prefs = [
        makePreference({ serviceFilters: ['svc-aws'] }),
      ];

      const results = await dispatcher.dispatch(
        makePayload({ serviceId: 'svc-github' }),
        prefs,
      );

      expect(results).toHaveLength(0);
    });

    it('sends when service matches filter', async () => {
      const senders = createSendersMap(
        [NotificationChannel.WEBHOOK, mockWebhookSender],
      );
      const dispatcher = new NotificationDispatcher(senders);

      const prefs = [
        makePreference({ serviceFilters: ['svc-github', 'svc-aws'] }),
      ];

      const results = await dispatcher.dispatch(
        makePayload({ serviceId: 'svc-github' }),
        prefs,
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
    });
  });

  describe('min severity', () => {
    it('blocks low-severity notification when min is DEGRADED', async () => {
      const senders = createSendersMap(
        [NotificationChannel.WEBHOOK, mockWebhookSender],
      );
      const dispatcher = new NotificationDispatcher(senders);

      const prefs = [
        makePreference({ minSeverity: NotificationPriority.HIGH }),
      ];

      // INVESTIGATING maps to MEDIUM priority, which is below HIGH
      const results = await dispatcher.dispatch(
        makePayload({ outageState: 'INVESTIGATING' }),
        prefs,
      );

      expect(results).toHaveLength(0);
    });

    it('allows notification when severity meets minimum', async () => {
      const senders = createSendersMap(
        [NotificationChannel.WEBHOOK, mockWebhookSender],
      );
      const dispatcher = new NotificationDispatcher(senders);

      const prefs = [
        makePreference({ minSeverity: NotificationPriority.HIGH }),
      ];

      // MAJOR_OUTAGE maps to CRITICAL priority, which is above HIGH
      const results = await dispatcher.dispatch(
        makePayload({ outageState: 'MAJOR_OUTAGE' }),
        prefs,
      );

      expect(results).toHaveLength(1);
    });
  });

  describe('rate limiting', () => {
    it('blocks notifications exceeding rate limit per hour', async () => {
      const senders = createSendersMap(
        [NotificationChannel.WEBHOOK, mockWebhookSender],
      );
      const dispatcher = new NotificationDispatcher(senders, {
        rateLimitPerHour: 3,
      });

      const prefs = [makePreference({ userId: 'user-ratelimit' })];

      // Send 3 notifications (should all succeed)
      for (let i = 0; i < 3; i++) {
        const results = await dispatcher.dispatch(
          makePayload({ id: `notif-${i}` }),
          prefs,
        );
        expect(results).toHaveLength(1);
      }

      // 4th notification should be blocked
      const results = await dispatcher.dispatch(
        makePayload({ id: 'notif-blocked' }),
        prefs,
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('quiet hours', () => {
    it('blocks non-critical notifications during quiet hours', async () => {
      const senders = createSendersMap(
        [NotificationChannel.WEBHOOK, mockWebhookSender],
      );

      const now = new Date();
      const currentHour = now.getHours();
      const quietHoursMap = new Map<string, QuietHours>();
      quietHoursMap.set('user-quiet', {
        start: currentHour,
        end: (currentHour + 2) % 24,
      });

      const dispatcher = new NotificationDispatcher(senders, {
        quietHours: quietHoursMap,
      });

      const prefs = [makePreference({ userId: 'user-quiet' })];

      // DEGRADED (high priority but not critical) should be blocked
      const results = await dispatcher.dispatch(
        makePayload({ outageState: 'DEGRADED' }),
        prefs,
      );

      expect(results).toHaveLength(0);
    });

    it('allows critical notifications during quiet hours', async () => {
      const senders = createSendersMap(
        [NotificationChannel.WEBHOOK, mockWebhookSender],
      );

      const now = new Date();
      const currentHour = now.getHours();
      const quietHoursMap = new Map<string, QuietHours>();
      quietHoursMap.set('user-quiet', {
        start: currentHour,
        end: (currentHour + 2) % 24,
      });

      const dispatcher = new NotificationDispatcher(senders, {
        quietHours: quietHoursMap,
      });

      const prefs = [makePreference({ userId: 'user-quiet' })];

      // MAJOR_OUTAGE (critical) should still go through
      const results = await dispatcher.dispatch(
        makePayload({ outageState: 'MAJOR_OUTAGE' }),
        prefs,
      );

      expect(results).toHaveLength(1);
    });
  });

  describe('batch dispatch', () => {
    it('processes all payloads', async () => {
      const senders = createSendersMap(
        [NotificationChannel.WEBHOOK, mockWebhookSender],
      );
      const dispatcher = new NotificationDispatcher(senders);

      const payloads = [
        makePayload({ id: 'notif-1', serviceName: 'GitHub' }),
        makePayload({ id: 'notif-2', serviceName: 'AWS' }),
      ];
      const prefs = [makePreference()];

      const results = await dispatcher.dispatchBatch(payloads, prefs);

      expect(results).toHaveLength(2);
      expect(mockWebhookSender.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('failed delivery', () => {
    it('records failure in stats when sender fails', async () => {
      const failingSender: NotificationSender = {
        send: vi.fn().mockResolvedValue({
          notificationId: 'notif-001',
          channel: NotificationChannel.WEBHOOK,
          success: false,
          error: 'Connection refused',
          retryCount: 3,
        } satisfies DeliveryResult),
      };

      const senders = createSendersMap(
        [NotificationChannel.WEBHOOK, failingSender],
      );
      const dispatcher = new NotificationDispatcher(senders);

      const results = await dispatcher.dispatch(
        makePayload(),
        [makePreference()],
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);

      const stats = dispatcher.getDeliveryStats();
      expect(stats.failed).toBe(1);
      expect(stats.sent).toBe(0);
    });

    it('returns error result when no sender registered for channel', async () => {
      const senders = createSendersMap(); // empty
      const dispatcher = new NotificationDispatcher(senders);

      const results = await dispatcher.dispatch(
        makePayload(),
        [makePreference()],
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('No sender registered');
    });
  });

  describe('delivery stats', () => {
    it('tracks sent and failed counts by channel', async () => {
      const senders = createSendersMap(
        [NotificationChannel.WEBHOOK, mockWebhookSender],
        [NotificationChannel.EMAIL, mockEmailSender],
      );
      const dispatcher = new NotificationDispatcher(senders);

      await dispatcher.dispatch(makePayload(), [
        makePreference({ channel: NotificationChannel.WEBHOOK }),
        makePreference({
          userId: 'user-2',
          channel: NotificationChannel.EMAIL,
          config: { address: 'test@example.com' } satisfies EmailConfig,
        }),
      ]);

      const stats = dispatcher.getDeliveryStats();
      expect(stats.sent).toBe(2);
      expect(stats.byChannel['webhook']!.sent).toBe(1);
      expect(stats.byChannel['email']!.sent).toBe(1);
    });
  });
});
