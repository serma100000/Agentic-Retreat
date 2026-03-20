'use client';

import { useState } from 'react';
import { Settings, Bell, Key, Palette, User } from 'lucide-react';
import NotificationSettings from '@/components/NotificationSettings';
import ApiKeyManager from '@/components/ApiKeyManager';
import { cn } from '@/lib/utils';

type Tab = 'notifications' | 'api-keys' | 'account' | 'appearance';

const tabs: { id: Tab; label: string; icon: typeof Bell }[] = [
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'account', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('notifications');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-50">
          <Settings className="h-6 w-6" />
          Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your OpenPulse account, notifications, and API access.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="mb-8 border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'notifications' && <NotificationSettings />}

        {activeTab === 'api-keys' && <ApiKeyManager />}

        {activeTab === 'account' && (
          <div className="space-y-6">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                <User className="h-5 w-5" />
                Account
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Account management will be available once authentication is integrated.
              </p>
            </div>

            <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center dark:border-gray-700">
              <User className="mx-auto mb-3 h-10 w-10 text-gray-400" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Authentication Coming Soon
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                Sign in with GitHub, Google, or email to manage your account and preferences.
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Profile Information
                </h3>
                <div className="mt-3 space-y-3">
                  <div>
                    <label htmlFor="display-name" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Display Name
                    </label>
                    <input
                      id="display-name"
                      type="text"
                      placeholder="Your name"
                      disabled
                      className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      disabled
                      className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-red-200 p-4 dark:border-red-800/50">
                <h3 className="text-sm font-medium text-red-700 dark:text-red-400">
                  Danger Zone
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Delete your account and all associated data. This action is irreversible.
                </p>
                <button
                  type="button"
                  disabled
                  className="mt-3 cursor-not-allowed rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 opacity-50 dark:border-red-700 dark:text-red-400"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="space-y-6">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                <Palette className="h-5 w-5" />
                Appearance
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Customize how OpenPulse looks for you.
              </p>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Theme
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(['light', 'dark', 'system'] as const).map((theme) => {
                  const descriptions: Record<string, string> = {
                    light: 'Clean and bright interface',
                    dark: 'Easy on the eyes',
                    system: 'Match your system preference',
                  };
                  const current =
                    typeof window !== 'undefined'
                      ? localStorage.getItem('openpulse-theme') ?? 'system'
                      : 'system';

                  return (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => {
                        if (theme === 'system') {
                          localStorage.removeItem('openpulse-theme');
                          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                          document.documentElement.classList.toggle('dark', prefersDark);
                        } else {
                          localStorage.setItem('openpulse-theme', theme);
                          document.documentElement.classList.toggle('dark', theme === 'dark');
                        }
                        // Force re-render
                        window.dispatchEvent(new Event('storage'));
                      }}
                      className={cn(
                        'rounded-lg border p-4 text-left transition-colors',
                        current === theme
                          ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800',
                      )}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        {theme === 'light' && (
                          <div className="h-4 w-4 rounded-full border-2 border-yellow-400 bg-yellow-100" />
                        )}
                        {theme === 'dark' && (
                          <div className="h-4 w-4 rounded-full border-2 border-gray-600 bg-gray-800" />
                        )}
                        {theme === 'system' && (
                          <div className="h-4 w-4 rounded-full border-2 border-blue-400 bg-gradient-to-br from-yellow-100 to-gray-800" />
                        )}
                        <span className="text-sm font-medium capitalize text-gray-900 dark:text-gray-100">
                          {theme}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {descriptions[theme]}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Display Density
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(['comfortable', 'compact'] as const).map((density) => {
                  const descriptions: Record<string, string> = {
                    comfortable: 'More spacing, easier to scan',
                    compact: 'More information per screen',
                  };

                  return (
                    <button
                      key={density}
                      type="button"
                      className="rounded-lg border border-gray-200 p-4 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    >
                      <span className="text-sm font-medium capitalize text-gray-900 dark:text-gray-100">
                        {density}
                      </span>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {descriptions[density]}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
