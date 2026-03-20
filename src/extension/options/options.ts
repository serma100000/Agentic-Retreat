/**
 * OpenPulse extension options page logic.
 *
 * Manages API URL config, service subscriptions, notification
 * preferences, inline banner toggle, and theme selection.
 */

import {
  getSettings,
  saveSettings,
  getSubscribedServices,
  addService,
  removeService,
  type ExtensionSettings,
  type ServiceSubscription,
} from '../lib/storage.js';

const apiUrlInput = document.getElementById('api-url') as HTMLInputElement;
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const serviceListEl = document.getElementById('service-list') as HTMLUListElement;
const addSlugInput = document.getElementById('add-slug') as HTMLInputElement;
const addNameInput = document.getElementById('add-name') as HTMLInputElement;
const addDomainInput = document.getElementById('add-domain') as HTMLInputElement;
const addServiceBtn = document.getElementById('add-service-btn') as HTMLButtonElement;
const notificationsToggle = document.getElementById('notifications-toggle') as HTMLInputElement;
const bannerToggle = document.getElementById('banner-toggle') as HTMLInputElement;
const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const toastEl = document.getElementById('toast') as HTMLElement;

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string): void {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2000);
}

function renderServiceList(services: ServiceSubscription[]): void {
  serviceListEl.innerHTML = '';
  for (const service of services) {
    const li = document.createElement('li');

    const info = document.createElement('span');
    info.textContent = `${service.name} (${service.slug}) — ${service.domain}`;
    li.appendChild(info);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '\u00d7';
    removeBtn.title = `Remove ${service.name}`;
    removeBtn.addEventListener('click', async () => {
      await removeService(service.slug);
      const updated = await getSubscribedServices();
      renderServiceList(updated);
    });
    li.appendChild(removeBtn);

    serviceListEl.appendChild(li);
  }

  if (services.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No services subscribed yet.';
    li.style.color = '#6b7280';
    li.style.fontStyle = 'italic';
    serviceListEl.appendChild(li);
  }
}

async function loadSettings(): Promise<void> {
  const [settings, services] = await Promise.all([
    getSettings(),
    getSubscribedServices(),
  ]);

  apiUrlInput.value = settings.apiUrl;
  apiKeyInput.value = settings.apiKey;
  notificationsToggle.checked = settings.notificationsEnabled;
  bannerToggle.checked = settings.inlineBannerEnabled;
  themeSelect.value = settings.theme;

  renderServiceList(services);
}

addServiceBtn.addEventListener('click', async () => {
  const slug = addSlugInput.value.trim();
  const name = addNameInput.value.trim();
  const domain = addDomainInput.value.trim();

  if (!slug || !name || !domain) {
    showToast('Please fill in all service fields.');
    return;
  }

  await addService({ slug, name, domain });
  addSlugInput.value = '';
  addNameInput.value = '';
  addDomainInput.value = '';

  const services = await getSubscribedServices();
  renderServiceList(services);
  showToast(`Added ${name}`);
});

saveBtn.addEventListener('click', async () => {
  const updatedSettings: Partial<ExtensionSettings> = {
    apiUrl: apiUrlInput.value.trim() || 'https://api.openpulse.io',
    apiKey: apiKeyInput.value.trim(),
    notificationsEnabled: notificationsToggle.checked,
    inlineBannerEnabled: bannerToggle.checked,
    theme: themeSelect.value as ExtensionSettings['theme'],
  };

  await saveSettings(updatedSettings);
  showToast('Settings saved');
});

loadSettings();
