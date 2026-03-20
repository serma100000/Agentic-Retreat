/**
 * OpenPulse extension background service worker.
 *
 * Polls the OpenPulse API for active outages, updates the badge,
 * sends desktop notifications for new outages, and manages the
 * periodic alarm.
 */

import { getActiveOutages, type OutageInfo } from './lib/api-client.js';
import {
  getSettings,
  getSubscribedServices,
  getLastSeenOutageIds,
  setLastSeenOutageIds,
} from './lib/storage.js';

const ALARM_NAME = 'openpulse-poll';

function statusToColor(status: string): string {
  switch (status) {
    case 'MAJOR_OUTAGE':
      return '#dc2626';
    case 'PARTIAL_OUTAGE':
      return '#ea580c';
    case 'DEGRADED':
      return '#f59e0b';
    case 'INVESTIGATING':
      return '#3b82f6';
    default:
      return '#6b7280';
  }
}

async function updateBadge(count: number): Promise<void> {
  const text = count > 0 ? String(count) : '';
  const color = count > 0 ? '#dc2626' : '#10b981';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

async function sendNotification(outage: OutageInfo): Promise<void> {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return;

  chrome.notifications.create(`outage-${outage.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: `${outage.service_name} — ${outage.status.replace(/_/g, ' ')}`,
    message: outage.title || outage.summary || 'A new outage has been detected.',
    priority: outage.status === 'MAJOR_OUTAGE' ? 2 : 1,
  });
}

async function pollOutages(): Promise<void> {
  try {
    const [allOutages, subscribedServices, lastSeenIds] = await Promise.all([
      getActiveOutages(),
      getSubscribedServices(),
      getLastSeenOutageIds(),
    ]);

    const subscribedSlugs = new Set(subscribedServices.map((s) => s.slug));

    const relevantOutages = subscribedSlugs.size > 0
      ? allOutages.filter((o) => subscribedSlugs.has(o.service_slug))
      : allOutages;

    await updateBadge(relevantOutages.length);

    const lastSeenSet = new Set(lastSeenIds);
    const newOutages = relevantOutages.filter((o) => !lastSeenSet.has(o.id));

    for (const outage of newOutages) {
      await sendNotification(outage);
    }

    const currentIds = relevantOutages.map((o) => o.id);
    await setLastSeenOutageIds(currentIds);
  } catch (error) {
    console.error('[OpenPulse] Failed to poll outages:', error);
    await updateBadge(0);
  }
}

async function setupAlarm(): Promise<void> {
  const settings = await getSettings();
  const periodInMinutes = Math.max(1, settings.pollIntervalSeconds / 60);

  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 0,
    periodInMinutes,
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    pollOutages();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  setupAlarm();
  pollOutages();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
  pollOutages();
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('outage-')) {
    chrome.tabs.create({ url: 'https://openpulse.io/outages' });
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['settings']) {
    setupAlarm();
  }
});
