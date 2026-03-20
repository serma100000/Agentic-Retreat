/**
 * Email notification sender.
 *
 * Uses SMTP (configurable via environment) for production,
 * falls back to console logging or MailHog (localhost:1025) for dev.
 */

import { createTransport, type Transporter } from 'nodemailer';

import type {
  DeliveryResult,
  EmailConfig,
  NotificationSender,
  NotificationTemplate,
} from '../types.js';
import { NotificationChannel } from '../types.js';

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
}

const DEFAULT_DEV_SMTP: SmtpOptions = {
  host: 'localhost',
  port: 1025,
  secure: false,
  from: 'openpulse@localhost',
};

function smtpOptionsFromEnv(): SmtpOptions {
  const host = process.env['SMTP_HOST'];
  if (!host) {
    return DEFAULT_DEV_SMTP;
  }

  return {
    host,
    port: parseInt(process.env['SMTP_PORT'] ?? '587', 10),
    secure: process.env['SMTP_SECURE'] === 'true',
    auth:
      process.env['SMTP_USER'] && process.env['SMTP_PASS']
        ? { user: process.env['SMTP_USER'], pass: process.env['SMTP_PASS'] }
        : undefined,
    from: process.env['SMTP_FROM'] ?? 'noreply@openpulse.dev',
  };
}

export class EmailSender implements NotificationSender<EmailConfig> {
  private transporter: Transporter;
  private fromAddress: string;
  private maxRetries: number;

  constructor(options?: SmtpOptions) {
    const opts = options ?? smtpOptionsFromEnv();
    this.fromAddress = opts.from;
    this.maxRetries = 3;

    this.transporter = createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.secure,
      auth: opts.auth,
    });
  }

  async send(
    config: EmailConfig,
    template: NotificationTemplate,
  ): Promise<DeliveryResult> {
    const notificationId = crypto.randomUUID();
    let lastError: string | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.transporter.sendMail({
          from: this.fromAddress,
          to: config.address,
          subject: template.subject,
          text: template.body,
          html: this.renderHtml(template),
        });

        return {
          notificationId,
          channel: NotificationChannel.EMAIL,
          success: true,
          deliveredAt: new Date(),
          retryCount: attempt,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);

        if (attempt < this.maxRetries - 1) {
          await this.backoff(attempt);
        }
      }
    }

    return {
      notificationId,
      channel: NotificationChannel.EMAIL,
      success: false,
      error: lastError,
      retryCount: this.maxRetries,
    };
  }

  private renderHtml(template: NotificationTemplate): string {
    return [
      '<!DOCTYPE html>',
      '<html><head><meta charset="utf-8">',
      '<style>',
      'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; ',
      '  margin: 0; padding: 20px; background: #f5f5f5; color: #333; }',
      '.container { max-width: 600px; margin: 0 auto; background: #fff; ',
      '  border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }',
      'h1 { font-size: 18px; color: #111; margin-top: 0; }',
      '.content { white-space: pre-line; line-height: 1.6; }',
      '.footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; ',
      '  font-size: 12px; color: #888; }',
      '</style></head><body>',
      '<div class="container">',
      `<h1>${this.escapeHtml(template.subject)}</h1>`,
      `<div class="content">${this.escapeHtml(template.body)}</div>`,
      '<div class="footer">Sent by OpenPulse</div>',
      '</div></body></html>',
    ].join('\n');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private async backoff(attempt: number): Promise<void> {
    const ms = Math.min(1000 * Math.pow(2, attempt), 10_000);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
