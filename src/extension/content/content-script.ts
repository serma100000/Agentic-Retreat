/**
 * OpenPulse content script.
 *
 * Checks if the current domain matches a monitored service with an
 * active outage and injects a minimal dismissable banner at the top
 * of the page.
 */

interface ContentOutageInfo {
  service_name: string;
  status: string;
  confidence: number;
  id: string;
}

interface ContentSettings {
  inlineBannerEnabled: boolean;
  apiUrl: string;
  apiKey: string;
}

interface ContentServiceSubscription {
  slug: string;
  name: string;
  domain: string;
}

const BANNER_ID = 'openpulse-outage-banner';
const DISMISSED_KEY = 'openpulse-dismissed-banners';

function getStoredDismissals(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

function storeDismissal(outageId: string): void {
  const dismissed = getStoredDismissals();
  dismissed.add(outageId);
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
  } catch {
    /* ignore */
  }
}

function statusColor(status: string): string {
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

function injectBanner(outage: ContentOutageInfo): void {
  if (document.getElementById(BANNER_ID)) return;

  const confidencePercent = Math.round(outage.confidence * 100);
  const color = statusColor(outage.status);

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'alert');

  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 16px;
    background: ${color};
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    animation: openpulse-slide-down 0.3s ease-out;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes openpulse-slide-down {
      from { transform: translateY(-100%); }
      to { transform: translateY(0); }
    }
  `;
  banner.appendChild(style);

  const text = document.createElement('span');
  text.textContent = `${outage.service_name} is experiencing issues \u2014 Confidence: ${confidencePercent}%`;
  banner.appendChild(text);

  const link = document.createElement('a');
  link.href = `https://openpulse.io/outages/${encodeURIComponent(outage.id)}`;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Details';
  link.style.cssText = `
    color: #ffffff;
    text-decoration: underline;
    font-weight: 600;
    margin-left: 4px;
  `;
  banner.appendChild(link);

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = '\u00d7';
  dismissBtn.setAttribute('aria-label', 'Dismiss banner');
  dismissBtn.style.cssText = `
    background: transparent;
    border: none;
    color: #ffffff;
    font-size: 20px;
    font-weight: bold;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    margin-left: 8px;
    opacity: 0.8;
  `;
  dismissBtn.addEventListener('mouseenter', () => {
    dismissBtn.style.opacity = '1';
  });
  dismissBtn.addEventListener('mouseleave', () => {
    dismissBtn.style.opacity = '0.8';
  });
  dismissBtn.addEventListener('click', () => {
    banner.remove();
    storeDismissal(outage.id);
  });
  banner.appendChild(dismissBtn);

  document.body.prepend(banner);
}

async function getSettingsFromStorage(): Promise<ContentSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get('settings', (result) => {
      const defaults: ContentSettings = {
        inlineBannerEnabled: true,
        apiUrl: 'https://api.openpulse.io',
        apiKey: '',
      };
      const stored = result['settings'] as Partial<ContentSettings> | undefined;
      resolve({ ...defaults, ...stored });
    });
  });
}

async function getSubscribedServicesFromStorage(): Promise<ContentServiceSubscription[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get('subscribedServices', (result) => {
      resolve((result['subscribedServices'] as ContentServiceSubscription[] | undefined) ?? []);
    });
  });
}

async function fetchActiveOutages(
  apiUrl: string,
  apiKey: string,
): Promise<ContentOutageInfo[]> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const url = `${apiUrl.replace(/\/+$/, '')}/api/v1/outages/active`;
  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) return [];
  return (await response.json()) as ContentOutageInfo[];
}

async function run(): Promise<void> {
  try {
    const settings = await getSettingsFromStorage();
    if (!settings.inlineBannerEnabled) return;

    const services = await getSubscribedServicesFromStorage();
    if (services.length === 0) return;

    const currentHost = window.location.hostname.replace(/^www\./, '');
    const matchedService = services.find((s) => {
      const serviceDomain = s.domain.replace(/^www\./, '');
      return currentHost === serviceDomain || currentHost.endsWith(`.${serviceDomain}`);
    });
    if (!matchedService) return;

    const outages = await fetchActiveOutages(settings.apiUrl, settings.apiKey);
    const relevantOutage = outages.find(
      (o) => (o as ContentOutageInfo & { service_slug?: string }).service_slug === matchedService.slug,
    );
    if (!relevantOutage) return;

    const dismissed = getStoredDismissals();
    if (dismissed.has(relevantOutage.id)) return;

    injectBanner(relevantOutage);
  } catch (error) {
    console.debug('[OpenPulse] Content script error:', error);
  }
}

run();
