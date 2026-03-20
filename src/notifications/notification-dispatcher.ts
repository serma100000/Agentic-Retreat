/**
 * Central notification dispatch orchestrator.
 *
 * Routes notifications to the appropriate channel senders,
 * enforces rate limiting and quiet hours, collects delivery results.
 */

import type {
  ChannelConfig,
  DeliveryResult,
  NotificationChannelType,
  NotificationPayload,
  NotificationPreference,
  NotificationPriorityType,
  NotificationSender,
  NotificationTemplate,
} from './types.js';
import {
  NotificationChannel,
  NotificationPriority,
  PRIORITY_ORDER,
} from './types.js';
import { TemplateEngine } from './template-engine.js';

export interface QuietHours {
  start: number; // hour 0-23
  end: number; // hour 0-23
  timezone?: string;
}

export interface DispatcherOptions {
  rateLimitPerHour?: number;
  quietHours?: Map<string, QuietHours>;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface DeliveryStats {
  sent: number;
  failed: number;
  pending: number;
  byChannel: Record<string, { sent: number; failed: number }>;
}

export class NotificationDispatcher {
  private senders: Map<NotificationChannelType, NotificationSender>;
  private templateEngine: TemplateEngine;
  private rateLimitPerHour: number;
  private rateLimits: Map<string, RateLimitEntry>;
  private quietHours: Map<string, QuietHours>;
  private stats: DeliveryStats;

  constructor(
    senders: Map<NotificationChannelType, NotificationSender>,
    options?: DispatcherOptions,
  ) {
    this.senders = senders;
    this.templateEngine = new TemplateEngine();
    this.rateLimitPerHour = options?.rateLimitPerHour ?? 10;
    this.rateLimits = new Map();
    this.quietHours = options?.quietHours ?? new Map();
    this.stats = {
      sent: 0,
      failed: 0,
      pending: 0,
      byChannel: {},
    };
  }

  /**
   * Dispatch a notification to all matching user preferences.
   */
  async dispatch(
    payload: NotificationPayload,
    preferences: NotificationPreference[],
  ): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];

    for (const pref of preferences) {
      if (!this.shouldSend(pref, payload)) {
        continue;
      }

      const result = await this.sendToChannel(pref, payload);
      results.push(result);
      this.recordResult(result);
    }

    return results;
  }

  /**
   * Dispatch multiple payloads to all matching preferences.
   */
  async dispatchBatch(
    payloads: NotificationPayload[],
    preferences: NotificationPreference[],
  ): Promise<DeliveryResult[]> {
    const allResults: DeliveryResult[] = [];

    for (const payload of payloads) {
      const results = await this.dispatch(payload, preferences);
      allResults.push(...results);
    }

    return allResults;
  }

  /**
   * Get delivery statistics.
   */
  getDeliveryStats(): DeliveryStats {
    return { ...this.stats };
  }

  private shouldSend(
    pref: NotificationPreference,
    payload: NotificationPayload,
  ): boolean {
    if (!pref.enabled) {
      return false;
    }

    // Check service filter
    if (pref.serviceFilters && pref.serviceFilters.length > 0) {
      if (!pref.serviceFilters.includes(payload.serviceId)) {
        return false;
      }
    }

    // Check minimum severity
    if (pref.minSeverity) {
      const payloadPriority = this.templateEngine.priorityFromState(
        payload.outageState,
      );
      if (!this.meetsMinSeverity(payloadPriority, pref.minSeverity)) {
        return false;
      }
    }

    // Check rate limit
    if (this.isRateLimited(pref.userId)) {
      return false;
    }

    // Check quiet hours for non-critical
    const priority = this.templateEngine.priorityFromState(payload.outageState);
    if (
      priority !== NotificationPriority.CRITICAL &&
      this.isQuietHours(pref.userId)
    ) {
      return false;
    }

    return true;
  }

  private meetsMinSeverity(
    actual: NotificationPriorityType,
    minimum: NotificationPriorityType,
  ): boolean {
    return PRIORITY_ORDER[actual] >= PRIORITY_ORDER[minimum];
  }

  private isRateLimited(userId: string): boolean {
    const now = Date.now();
    const entry = this.rateLimits.get(userId);

    if (!entry || now - entry.windowStart > 3_600_000) {
      this.rateLimits.set(userId, { count: 1, windowStart: now });
      return false;
    }

    if (entry.count >= this.rateLimitPerHour) {
      return true;
    }

    entry.count++;
    return false;
  }

  private isQuietHours(userId: string): boolean {
    const qh = this.quietHours.get(userId);
    if (!qh) {
      return false;
    }

    const now = new Date();
    const hour = now.getHours();

    if (qh.start <= qh.end) {
      return hour >= qh.start && hour < qh.end;
    }
    // Wraps midnight (e.g., 22-7)
    return hour >= qh.start || hour < qh.end;
  }

  private async sendToChannel(
    pref: NotificationPreference,
    payload: NotificationPayload,
  ): Promise<DeliveryResult> {
    const sender = this.senders.get(pref.channel);
    if (!sender) {
      return {
        notificationId: payload.id,
        channel: pref.channel,
        success: false,
        error: `No sender registered for channel: ${pref.channel}`,
        retryCount: 0,
      };
    }

    const templateChannels: NotificationChannelType[] = [
      NotificationChannel.EMAIL,
      NotificationChannel.SLACK,
      NotificationChannel.DISCORD,
      NotificationChannel.TEAMS,
    ];

    let templateOrPayload: NotificationTemplate | NotificationPayload;

    if (templateChannels.includes(pref.channel)) {
      const isRecovery =
        payload.outageState === 'RESOLVED' ||
        payload.outageState === 'OPERATIONAL';
      templateOrPayload = isRecovery
        ? this.templateEngine.renderRecoveryNotification(payload)
        : this.templateEngine.renderOutageNotification(payload);
    } else {
      templateOrPayload = payload;
    }

    try {
      return await sender.send(
        pref.config as ChannelConfig,
        templateOrPayload,
      );
    } catch (err) {
      return {
        notificationId: payload.id,
        channel: pref.channel,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        retryCount: 0,
      };
    }
  }

  private recordResult(result: DeliveryResult): void {
    const channelKey = result.channel;

    if (!this.stats.byChannel[channelKey]) {
      this.stats.byChannel[channelKey] = { sent: 0, failed: 0 };
    }

    if (result.success) {
      this.stats.sent++;
      this.stats.byChannel[channelKey]!.sent++;
    } else {
      this.stats.failed++;
      this.stats.byChannel[channelKey]!.failed++;
    }
  }
}
