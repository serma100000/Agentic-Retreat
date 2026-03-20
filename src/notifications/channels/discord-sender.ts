/**
 * Discord notification sender using webhook embeds.
 */

import type {
  DeliveryResult,
  DiscordConfig,
  NotificationSender,
  NotificationTemplate,
} from '../types.js';
import { NotificationChannel } from '../types.js';

const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: Array<{ name: string; value: string; inline: boolean }>;
  footer: { text: string };
  timestamp: string;
}

export class DiscordSender implements NotificationSender<DiscordConfig> {
  async send(
    config: DiscordConfig,
    template: NotificationTemplate,
  ): Promise<DeliveryResult> {
    const notificationId = crypto.randomUUID();
    let lastError: string | undefined;

    const discordPayload = this.buildPayload(template);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordPayload),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (response.ok || response.status === 204) {
          return {
            notificationId,
            channel: NotificationChannel.DISCORD,
            success: true,
            deliveredAt: new Date(),
            retryCount: attempt,
          };
        }

        lastError = `HTTP ${response.status}: ${response.statusText}`;

        if (response.status >= 400 && response.status < 500) {
          return {
            notificationId,
            channel: NotificationChannel.DISCORD,
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
      channel: NotificationChannel.DISCORD,
      success: false,
      error: lastError,
      retryCount: MAX_RETRIES,
    };
  }

  buildPayload(template: NotificationTemplate): { embeds: DiscordEmbed[] } {
    const color = this.colorFromSubject(template.subject);
    const fields = this.extractFields(template.body);

    return {
      embeds: [
        {
          title: template.subject.replace('[OpenPulse] ', ''),
          description: template.markdown,
          color,
          fields,
          footer: { text: 'OpenPulse' },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  private extractFields(
    body: string,
  ): Array<{ name: string; value: string; inline: boolean }> {
    const fields: Array<{ name: string; value: string; inline: boolean }> = [];
    const lines = body.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w[\w\s]*?):\s+(.+)$/);
      if (match?.[1] && match[2]) {
        fields.push({
          name: match[1],
          value: match[2],
          inline: fields.length < 4,
        });
      }
    }

    return fields;
  }

  private colorFromSubject(subject: string): number {
    if (subject.includes('MAJOR_OUTAGE')) return 0xe01e5a; // red
    if (subject.includes('DEGRADED')) return 0xecb22e; // yellow
    if (subject.includes('INVESTIGATING')) return 0xecb22e; // yellow
    if (subject.includes('Recovered') || subject.includes('RESOLVED')) {
      return 0x2eb67d; // green
    }
    return 0x808080; // grey
  }

  private async backoff(attempt: number): Promise<void> {
    const ms = Math.min(1000 * Math.pow(2, attempt), 10_000);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
