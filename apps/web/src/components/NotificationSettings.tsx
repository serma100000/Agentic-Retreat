'use client';

import { useState, useCallback } from 'react';
import { Bell, Mail, Globe, MessageSquare, Hash, Save, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChannelConfig {
  enabled: boolean;
  email?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  slackUrl?: string;
  discordUrl?: string;
}

interface NotificationPrefs {
  channels: {
    email: ChannelConfig;
    webhook: ChannelConfig;
    slack: ChannelConfig;
    discord: ChannelConfig;
  };
  services: string[];
  minSeverity: 'investigating' | 'degraded' | 'major_outage';
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
}

const MOCK_SERVICES = [
  { slug: 'aws', name: 'Amazon Web Services' },
  { slug: 'gcp', name: 'Google Cloud Platform' },
  { slug: 'azure', name: 'Microsoft Azure' },
  { slug: 'cloudflare', name: 'Cloudflare' },
  { slug: 'github', name: 'GitHub' },
  { slug: 'vercel', name: 'Vercel' },
  { slug: 'netlify', name: 'Netlify' },
  { slug: 'stripe', name: 'Stripe' },
  { slug: 'twilio', name: 'Twilio' },
  { slug: 'datadog', name: 'Datadog' },
];

const SEVERITY_OPTIONS = [
  { value: 'investigating', label: 'Investigating', description: 'All detections including early investigations' },
  { value: 'degraded', label: 'Degraded', description: 'Service degradation and above' },
  { value: 'major_outage', label: 'Major Outage', description: 'Only confirmed major outages' },
] as const;

const initialPrefs: NotificationPrefs = {
  channels: {
    email: { enabled: false, email: '' },
    webhook: { enabled: false, webhookUrl: '', webhookSecret: '' },
    slack: { enabled: false, slackUrl: '' },
    discord: { enabled: false, discordUrl: '' },
  },
  services: [],
  minSeverity: 'degraded',
  quietHours: { enabled: false, start: '22:00', end: '08:00' },
};

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initialPrefs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateChannel = useCallback((
    channel: keyof NotificationPrefs['channels'],
    updates: Partial<ChannelConfig>,
  ) => {
    setPrefs((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: { ...prev.channels[channel], ...updates },
      },
    }));
  }, []);

  const toggleService = useCallback((slug: string) => {
    setPrefs((prev) => ({
      ...prev,
      services: prev.services.includes(slug)
        ? prev.services.filter((s) => s !== slug)
        : [...prev.services, slug],
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
      const response = await fetch(`${baseUrl}/api/v1/notifications/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });

      if (!response.ok) {
        throw new Error(`Failed to save: ${response.status}`);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure how and when you receive outage notifications.
        </p>
      </div>

      {/* Channels */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Channels
        </h3>

        {/* Email */}
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
                <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Email</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Receive email notifications</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.channels.email.enabled}
              onClick={() => updateChannel('email', { enabled: !prefs.channels.email.enabled })}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                prefs.channels.email.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700',
              )}
            >
              <span
                className={cn(
                  'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm',
                  prefs.channels.email.enabled && 'translate-x-5',
                )}
              />
            </button>
          </div>
          {prefs.channels.email.enabled && (
            <div className="mt-3">
              <label htmlFor="email-address" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Email Address
              </label>
              <input
                id="email-address"
                type="email"
                placeholder="you@example.com"
                value={prefs.channels.email.email ?? ''}
                onChange={(e) => updateChannel('email', { email: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
          )}
        </div>

        {/* Webhook */}
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/30">
                <Globe className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Webhook</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Send HTTP POST to your endpoint</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.channels.webhook.enabled}
              onClick={() => updateChannel('webhook', { enabled: !prefs.channels.webhook.enabled })}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                prefs.channels.webhook.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700',
              )}
            >
              <span
                className={cn(
                  'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm',
                  prefs.channels.webhook.enabled && 'translate-x-5',
                )}
              />
            </button>
          </div>
          {prefs.channels.webhook.enabled && (
            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="webhook-url" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Webhook URL
                </label>
                <input
                  id="webhook-url"
                  type="url"
                  placeholder="https://your-server.com/webhook"
                  value={prefs.channels.webhook.webhookUrl ?? ''}
                  onChange={(e) => updateChannel('webhook', { webhookUrl: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
              <div>
                <label htmlFor="webhook-secret" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Signing Secret (optional)
                </label>
                <input
                  id="webhook-secret"
                  type="password"
                  placeholder="whsec_..."
                  value={prefs.channels.webhook.webhookSecret ?? ''}
                  onChange={(e) => updateChannel('webhook', { webhookSecret: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Slack */}
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/30">
                <Hash className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Slack</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Post to a Slack channel</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.channels.slack.enabled}
              onClick={() => updateChannel('slack', { enabled: !prefs.channels.slack.enabled })}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                prefs.channels.slack.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700',
              )}
            >
              <span
                className={cn(
                  'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm',
                  prefs.channels.slack.enabled && 'translate-x-5',
                )}
              />
            </button>
          </div>
          {prefs.channels.slack.enabled && (
            <div className="mt-3">
              <label htmlFor="slack-url" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Slack Webhook URL
              </label>
              <input
                id="slack-url"
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                value={prefs.channels.slack.slackUrl ?? ''}
                onChange={(e) => updateChannel('slack', { slackUrl: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
          )}
        </div>

        {/* Discord */}
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
                <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Discord</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Post to a Discord channel</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.channels.discord.enabled}
              onClick={() => updateChannel('discord', { enabled: !prefs.channels.discord.enabled })}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                prefs.channels.discord.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700',
              )}
            >
              <span
                className={cn(
                  'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm',
                  prefs.channels.discord.enabled && 'translate-x-5',
                )}
              />
            </button>
          </div>
          {prefs.channels.discord.enabled && (
            <div className="mt-3">
              <label htmlFor="discord-url" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Discord Webhook URL
              </label>
              <input
                id="discord-url"
                type="url"
                placeholder="https://discord.com/api/webhooks/..."
                value={prefs.channels.discord.discordUrl ?? ''}
                onChange={(e) => updateChannel('discord', { discordUrl: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Service Filter */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Watched Services
        </h3>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Select which services to receive notifications for. Leave empty to watch all.
        </p>
        <div className="flex flex-wrap gap-2">
          {MOCK_SERVICES.map((service) => {
            const isSelected = prefs.services.includes(service.slug);
            return (
              <button
                key={service.slug}
                type="button"
                onClick={() => toggleService(service.slug)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  isSelected
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-gray-600',
                )}
              >
                {isSelected && <Check className="mr-1 inline h-3 w-3" />}
                {service.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Minimum Severity */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Minimum Severity
        </h3>
        <div className="space-y-2">
          {SEVERITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                prefs.minSeverity === option.value
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                  : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800',
              )}
            >
              <input
                type="radio"
                name="minSeverity"
                value={option.value}
                checked={prefs.minSeverity === option.value}
                onChange={() => setPrefs((prev) => ({ ...prev, minSeverity: option.value }))}
                className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{option.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Quiet Hours */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Quiet Hours
        </h3>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Enable Quiet Hours
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Suppress non-critical notifications during specified hours
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.quietHours.enabled}
              onClick={() =>
                setPrefs((prev) => ({
                  ...prev,
                  quietHours: { ...prev.quietHours, enabled: !prev.quietHours.enabled },
                }))
              }
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                prefs.quietHours.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700',
              )}
            >
              <span
                className={cn(
                  'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm',
                  prefs.quietHours.enabled && 'translate-x-5',
                )}
              />
            </button>
          </div>
          {prefs.quietHours.enabled && (
            <div className="mt-4 flex items-center gap-3">
              <div>
                <label htmlFor="quiet-start" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Start
                </label>
                <input
                  id="quiet-start"
                  type="time"
                  value={prefs.quietHours.start}
                  onChange={(e) =>
                    setPrefs((prev) => ({
                      ...prev,
                      quietHours: { ...prev.quietHours, start: e.target.value },
                    }))
                  }
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <span className="mt-5 text-gray-400">to</span>
              <div>
                <label htmlFor="quiet-end" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  End
                </label>
                <input
                  id="quiet-end"
                  type="time"
                  value={prefs.quietHours.end}
                  onChange={(e) =>
                    setPrefs((prev) => ({
                      ...prev,
                      quietHours: { ...prev.quietHours, end: e.target.value },
                    }))
                  }
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 border-t border-gray-200 pt-6 dark:border-gray-700">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors',
            saving
              ? 'cursor-not-allowed bg-blue-400'
              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
          )}
        >
          {saving ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving...
            </>
          ) : saved ? (
            <>
              <Check className="h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Preferences
            </>
          )}
        </button>

        {error && (
          <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
