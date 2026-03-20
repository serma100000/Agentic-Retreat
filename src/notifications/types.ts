/**
 * Types for the OpenPulse notification dispatch system.
 *
 * Covers notification channels, priorities, payloads,
 * user preferences, channel configs, and delivery results.
 */

export const NotificationChannel = {
  EMAIL: 'email',
  WEBHOOK: 'webhook',
  SLACK: 'slack',
  DISCORD: 'discord',
  TEAMS: 'teams',
  PAGERDUTY: 'pagerduty',
  SMS: 'sms',
  PUSH: 'push',
} as const;

export type NotificationChannelType =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type NotificationPriorityType =
  (typeof NotificationPriority)[keyof typeof NotificationPriority];

export interface NotificationPayload {
  id: string;
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  outageState: string;
  previousState: string;
  confidence: number;
  affectedRegions: string[];
  timestamp: Date;
  message: string;
}

export interface EmailConfig {
  address: string;
}

export interface WebhookConfig {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
}

export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
}

export interface DiscordConfig {
  webhookUrl: string;
}

export interface TeamsConfig {
  webhookUrl: string;
}

export interface PagerDutyConfig {
  routingKey: string;
  severity?: string;
}

export interface SmsConfig {
  phoneNumber: string;
}

export interface PushConfig {
  deviceToken: string;
  platform: 'ios' | 'android' | 'web';
}

export type ChannelConfig =
  | EmailConfig
  | WebhookConfig
  | SlackConfig
  | DiscordConfig
  | TeamsConfig
  | PagerDutyConfig
  | SmsConfig
  | PushConfig;

export interface NotificationPreference {
  userId: string;
  channel: NotificationChannelType;
  config: ChannelConfig;
  enabled: boolean;
  serviceFilters?: string[];
  minSeverity?: NotificationPriorityType;
}

export interface DeliveryResult {
  notificationId: string;
  channel: NotificationChannelType;
  success: boolean;
  error?: string;
  deliveredAt?: Date;
  retryCount: number;
}

export interface NotificationTemplate {
  subject: string;
  body: string;
  markdown: string;
}

export interface NotificationSender<TConfig = ChannelConfig> {
  send(
    config: TConfig,
    templateOrPayload: NotificationTemplate | NotificationPayload,
  ): Promise<DeliveryResult>;
}

export interface QueueItem {
  id: string;
  payload: NotificationPayload;
  preference: NotificationPreference;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: Date;
  error?: string;
  status: 'pending' | 'processing' | 'failed' | 'dead';
  createdAt: Date;
}

/**
 * Priority ordering for severity comparison.
 */
export const PRIORITY_ORDER: Record<NotificationPriorityType, number> = {
  [NotificationPriority.LOW]: 0,
  [NotificationPriority.MEDIUM]: 1,
  [NotificationPriority.HIGH]: 2,
  [NotificationPriority.CRITICAL]: 3,
};
