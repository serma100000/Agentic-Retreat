/**
 * PagerDuty Events API v2 notification sender.
 */

import type {
  DeliveryResult,
  NotificationPayload,
  NotificationSender,
  PagerDutyConfig,
} from '../types.js';
import { NotificationChannel } from '../types.js';

const PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue';
const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;

type PdSeverity = 'critical' | 'error' | 'warning' | 'info';
type PdEventAction = 'trigger' | 'resolve';

export class PagerDutySender implements NotificationSender<PagerDutyConfig> {
  async send(
    config: PagerDutyConfig,
    payload: NotificationPayload,
  ): Promise<DeliveryResult> {
    const notificationId = payload.id;
    let lastError: string | undefined;

    const eventAction = this.resolveEventAction(payload.outageState);
    const severity = this.resolveSeverity(payload.outageState, config.severity);
    const dedupKey = `openpulse-${payload.serviceId}`;

    const pdPayload = this.buildPayload(
      config,
      payload,
      eventAction,
      severity,
      dedupKey,
    );

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(PAGERDUTY_EVENTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pdPayload),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (response.ok || response.status === 202) {
          return {
            notificationId,
            channel: NotificationChannel.PAGERDUTY,
            success: true,
            deliveredAt: new Date(),
            retryCount: attempt,
          };
        }

        lastError = `HTTP ${response.status}: ${response.statusText}`;

        if (response.status >= 400 && response.status < 500) {
          return {
            notificationId,
            channel: NotificationChannel.PAGERDUTY,
            success: false,
            error: lastError,
            retryCount: attempt,
          };
        }

        if (attempt < MAX_RETRIES - 1) {
          await this.backoff(attempt);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          lastError = 'Request timed out';
        } else {
          lastError = err instanceof Error ? err.message : String(err);
        }

        if (attempt < MAX_RETRIES - 1) {
          await this.backoff(attempt);
        }
      }
    }

    return {
      notificationId,
      channel: NotificationChannel.PAGERDUTY,
      success: false,
      error: lastError,
      retryCount: MAX_RETRIES,
    };
  }

  private buildPayload(
    config: PagerDutyConfig,
    payload: NotificationPayload,
    eventAction: PdEventAction,
    severity: PdSeverity,
    dedupKey: string,
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      routing_key: config.routingKey,
      event_action: eventAction,
      dedup_key: dedupKey,
    };

    if (eventAction === 'trigger') {
      base['payload'] = {
        summary: `[OpenPulse] ${payload.serviceName} - ${payload.outageState}`,
        source: `openpulse-${payload.serviceSlug}`,
        severity,
        timestamp: payload.timestamp.toISOString(),
        component: payload.serviceName,
        group: payload.serviceSlug,
        class: payload.outageState,
        custom_details: {
          confidence: payload.confidence,
          affected_regions: payload.affectedRegions,
          previous_state: payload.previousState,
          message: payload.message,
        },
      };
    }

    return base;
  }

  resolveEventAction(outageState: string): PdEventAction {
    if (outageState === 'RESOLVED' || outageState === 'OPERATIONAL') {
      return 'resolve';
    }
    return 'trigger';
  }

  resolveSeverity(outageState: string, configSeverity?: string): PdSeverity {
    if (configSeverity) {
      return configSeverity as PdSeverity;
    }

    switch (outageState) {
      case 'MAJOR_OUTAGE':
        return 'critical';
      case 'DEGRADED':
        return 'warning';
      case 'INVESTIGATING':
        return 'info';
      case 'RECOVERING':
        return 'info';
      default:
        return 'info';
    }
  }

  private async backoff(attempt: number): Promise<void> {
    const ms = Math.min(1000 * Math.pow(2, attempt), 10_000);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
