/**
 * OpenPulse extension popup logic.
 *
 * Fetches active outages for the user's subscribed services,
 * renders them as a filterable card list, and handles UI states.
 */

import { getActiveOutages, type OutageInfo } from '../lib/api-client.js';
import { getSubscribedServices } from '../lib/storage.js';

const outageListEl = document.getElementById('outage-list') as HTMLElement;
const emptyStateEl = document.getElementById('empty-state') as HTMLElement;
const loadingStateEl = document.getElementById('loading-state') as HTMLElement;
const errorStateEl = document.getElementById('error-state') as HTMLElement;
const errorTextEl = document.getElementById('error-text') as HTMLElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
const retryBtn = document.getElementById('retry-btn') as HTMLButtonElement;

let currentOutages: OutageInfo[] = [];

function statusToCssClass(status: string): string {
  return `status-badge--${status.toLowerCase().replace(/_/g, '-')}`;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function renderOutage(outage: OutageInfo): HTMLElement {
  const card = document.createElement('div');
  card.className = 'outage-card';
  card.setAttribute('role', 'listitem');
  card.dataset['serviceSlug'] = outage.service_slug;

  card.innerHTML = `
    <div class="outage-header">
      <span class="outage-service">${escapeHtml(outage.service_name)}</span>
      <span class="status-badge ${statusToCssClass(outage.status)}">${statusLabel(outage.status)}</span>
    </div>
    <p class="outage-title">${escapeHtml(outage.title || outage.summary || 'Outage detected')}</p>
    <div class="outage-meta">
      <span>Confidence: ${Math.round(outage.confidence * 100)}% &middot; ${relativeTime(outage.started_at)}</span>
      <a href="https://openpulse.io/outages/${encodeURIComponent(outage.id)}" target="_blank" rel="noopener">
        View
      </a>
    </div>
  `;

  return card;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showState(state: 'loading' | 'empty' | 'error' | 'list'): void {
  loadingStateEl.hidden = state !== 'loading';
  emptyStateEl.hidden = state !== 'empty';
  errorStateEl.hidden = state !== 'error';
  outageListEl.hidden = state !== 'list';
}

function renderList(outages: OutageInfo[]): void {
  outageListEl.innerHTML = '';
  for (const outage of outages) {
    outageListEl.appendChild(renderOutage(outage));
  }
}

function applyFilter(query: string): void {
  const lower = query.toLowerCase().trim();
  if (!lower) {
    renderList(currentOutages);
    return;
  }
  const filtered = currentOutages.filter(
    (o) =>
      o.service_name.toLowerCase().includes(lower) ||
      o.title.toLowerCase().includes(lower) ||
      o.status.toLowerCase().replace(/_/g, ' ').includes(lower),
  );
  renderList(filtered);
}

async function loadOutages(): Promise<void> {
  showState('loading');

  try {
    const [allOutages, subscribedServices] = await Promise.all([
      getActiveOutages(),
      getSubscribedServices(),
    ]);

    const subscribedSlugs = new Set(subscribedServices.map((s) => s.slug));

    currentOutages =
      subscribedSlugs.size > 0
        ? allOutages.filter((o) => subscribedSlugs.has(o.service_slug))
        : allOutages;

    if (currentOutages.length === 0) {
      showState('empty');
    } else {
      renderList(currentOutages);
      showState('list');
    }
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message: string }).message)
        : 'Failed to load outages.';
    errorTextEl.textContent = message;
    showState('error');
  }
}

searchInput.addEventListener('input', () => {
  applyFilter(searchInput.value);
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

retryBtn.addEventListener('click', () => {
  loadOutages();
});

loadOutages();
