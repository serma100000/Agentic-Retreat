/**
 * Slack notification sender using incoming webhooks and Block Kit.
 */

import type {
  DeliveryResult,
  NotificationSender,
  NotificationTemplate,
  SlackConfig,
} from '../types.js';
import { NotificationChannel } from '../types.js';

const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<{ type: string; text: string }>;
}

export class SlackSender implements NotificationSender<SlackConfig> {
  async send(
    config: SlackConfig,
    template: NotificationTemplate,
  ): Promise<DeliveryResult> {
    const notificationId = crypto.randomUUID();
    let lastError: string | undefined;

    const slackPayload = this.buildSlackPayload(config, template);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackPayload),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (response.ok) {
          return {
            notificationId,
            channel: NotificationChannel.SLACK,
            success: true,
            deliveredAt: new Date(),
            retryCount: attempt,
          };
        }

        lastError = `HTTP ${response.status}: ${response.statusText}`;

        if (response.status >= 400 && response.status < 500) {
          return {
            notificationId,
            channel: NotificationChannel.SLACK,
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
      channel: NotificationChannel.SLACK,
      success: false,
      error: lastError,
      retryCount: MAX_RETRIES,
    };
  }

  buildSlackPayload(
    config: SlackConfig,
    template: NotificationTemplate,
  ): Record<string, unknown> {
    const color = this.colorFromSubject(template.subject);
    const blocks = this.buildBlocks(template);

    const payload: Record<string, unknown> = {
      blocks,
      attachments: [
        {
          color,
          blocks: [],
        },
      ],
    };

    if (config.channel) {
      payload['channel'] = config.channel;
    }

    return payload;
  }

  buildBlocks(template: NotificationTemplate): SlackBlock[] {
    const headerText = template.subject.replace('[OpenPulse] ', '');
    const emoji = this.emojiFromSubject(template.subject);

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${headerText}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: template.markdown,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Sent by *OpenPulse* | <https://openpulse.dev|Dashboard>',
          },
        ],
      },
    ];

    return blocks;
  }

  colorFromSubject(subject: string): string {
    if (
      subject.includes('MAJOR_OUTAGE') ||
      subject.includes('CRITICAL')
    ) {
      return '#e01e5a'; // red
    }
    if (
      subject.includes('DEGRADED') ||
      subject.includes('INVESTIGATING')
    ) {
      return '#ecb22e'; // yellow
    }
    if (
      subject.includes('Recovered') ||
      subject.includes('RESOLVED') ||
      subject.includes('OPERATIONAL')
    ) {
      return '#2eb67d'; // green
    }
    return '#808080'; // grey
  }

  private emojiFromSubject(subject: string): string {
    if (subject.includes('MAJOR_OUTAGE')) return '🔴';
    if (subject.includes('DEGRADED')) return '🟡';
    if (subject.includes('INVESTIGATING')) return '🔍';
    if (subject.includes('Recovered') || subject.includes('RESOLVED')) return '✅';
    return '⚪';
  }

  private async backoff(attempt: number): Promise<void> {
    const ms = Math.min(1000 * Math.pow(2, attempt), 10_000);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
