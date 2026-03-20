/**
 * Webhook notification sender.
 *
 * POSTs JSON payloads to configured URLs with optional HMAC-SHA256 signing.
 */

import { createHmac } from 'node:crypto';

import type {
  DeliveryResult,
  NotificationPayload,
  NotificationSender,
  WebhookConfig,
} from '../types.js';
import { NotificationChannel } from '../types.js';

const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;

export class WebhookSender implements NotificationSender<WebhookConfig> {
  async send(
    config: WebhookConfig,
    payload: NotificationPayload,
  ): Promise<DeliveryResult> {
    const notificationId = payload.id;
    const body = JSON.stringify(payload);
    let lastError: string | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'OpenPulse/1.0',
          ...config.headers,
        };

        if (config.secret) {
          headers['X-OpenPulse-Signature'] = this.computeSignature(
            body,
            config.secret,
          );
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(config.url, {
            method: 'POST',
            headers,
            body,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (response.ok) {
          return {
            notificationId,
            channel: NotificationChannel.WEBHOOK,
            success: true,
            deliveredAt: new Date(),
            retryCount: attempt,
          };
        }

        const statusCode = response.status;
        lastError = `HTTP ${statusCode}: ${response.statusText}`;

        // Do not retry client errors (4xx) — they are not transient
        if (statusCode >= 400 && statusCode < 500) {
          return {
            notificationId,
            channel: NotificationChannel.WEBHOOK,
            success: false,
            error: lastError,
            retryCount: attempt,
          };
        }

        // Server errors (5xx) are retryable
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
      channel: NotificationChannel.WEBHOOK,
      success: false,
      error: lastError,
      retryCount: MAX_RETRIES,
    };
  }

  computeSignature(body: string, secret: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  private async backoff(attempt: number): Promise<void> {
    const ms = Math.min(1000 * Math.pow(2, attempt), 10_000);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
