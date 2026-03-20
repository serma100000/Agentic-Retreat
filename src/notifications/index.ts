/**
 * OpenPulse Notification Dispatch System
 *
 * Multi-channel alerting with rate limiting, quiet hours,
 * and reliable delivery queue.
 */

export * from './types.js';
export { TemplateEngine } from './template-engine.js';
export { EmailSender } from './channels/email-sender.js';
export { WebhookSender } from './channels/webhook-sender.js';
export { SlackSender } from './channels/slack-sender.js';
export { DiscordSender } from './channels/discord-sender.js';
export { PagerDutySender } from './channels/pagerduty-sender.js';
export { NotificationDispatcher } from './notification-dispatcher.js';
export type { QuietHours, DispatcherOptions } from './notification-dispatcher.js';
export { NotificationQueue } from './notification-queue.js';
