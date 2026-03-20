'use client';

import { useState, useMemo } from 'react';
import { Search, Puzzle, BookOpen } from 'lucide-react';
import PluginCard from '@/components/PluginCard';

interface Plugin {
  name: string;
  author: string;
  description: string;
  version: string;
  category: 'Detection' | 'Notification' | 'Visualization';
  installs: number;
  rating: number;
  featured: boolean;
}

const plugins: Plugin[] = [
  {
    name: 'DNS Deep Probe',
    author: 'OpenPulse Team',
    description: 'Advanced DNS resolution monitoring with DNSSEC validation, propagation tracking, and zone transfer detection across 50+ global resolvers.',
    version: '2.1.0',
    category: 'Detection',
    installs: 45200,
    rating: 4.8,
    featured: true,
  },
  {
    name: 'Slack Notifier Pro',
    author: 'integration-labs',
    description: 'Rich Slack notifications with customizable templates, thread grouping, severity-based channels, and interactive incident actions.',
    version: '3.4.2',
    category: 'Notification',
    installs: 78400,
    rating: 4.7,
    featured: true,
  },
  {
    name: 'Heatmap Visualizer',
    author: 'dataviz-co',
    description: 'Real-time geographic heatmap showing outage intensity by region. Supports custom color scales, zoom levels, and time-lapse playback.',
    version: '1.8.1',
    category: 'Visualization',
    installs: 32100,
    rating: 4.6,
    featured: true,
  },
  {
    name: 'SSL Certificate Monitor',
    author: 'secops-tools',
    description: 'Monitors SSL/TLS certificate expiration, chain validity, and cipher strength. Alerts 30/14/7 days before expiry.',
    version: '1.3.0',
    category: 'Detection',
    installs: 28700,
    rating: 4.5,
    featured: false,
  },
  {
    name: 'PagerDuty Bridge',
    author: 'incident-io',
    description: 'Bi-directional PagerDuty integration. Auto-creates incidents, syncs status updates, and maps severity levels.',
    version: '2.0.4',
    category: 'Notification',
    installs: 41300,
    rating: 4.4,
    featured: false,
  },
  {
    name: 'Uptime SLA Dashboard',
    author: 'metrics-hub',
    description: 'Calculate and display SLA compliance with customizable thresholds. Generates monthly reports with availability percentages.',
    version: '1.5.2',
    category: 'Visualization',
    installs: 19800,
    rating: 4.3,
    featured: false,
  },
  {
    name: 'TCP Port Scanner',
    author: 'netops-tools',
    description: 'Lightweight TCP port monitoring for critical services. Supports custom port ranges, connection timeouts, and banner grabbing.',
    version: '1.1.0',
    category: 'Detection',
    installs: 15400,
    rating: 4.2,
    featured: false,
  },
  {
    name: 'Microsoft Teams Alerts',
    author: 'enterprise-connect',
    description: 'Adaptive card notifications for Microsoft Teams with action buttons, incident timelines, and channel routing.',
    version: '2.2.1',
    category: 'Notification',
    installs: 36500,
    rating: 4.1,
    featured: false,
  },
  {
    name: 'Incident Timeline',
    author: 'OpenPulse Team',
    description: 'Interactive timeline visualization of incidents with zoom, filtering, and correlation lines between related outages.',
    version: '1.9.0',
    category: 'Visualization',
    installs: 22600,
    rating: 4.5,
    featured: false,
  },
  {
    name: 'HTTP Content Checker',
    author: 'webops-inc',
    description: 'Deep HTTP response validation with body content matching, header checks, response time thresholds, and redirect chain analysis.',
    version: '1.4.3',
    category: 'Detection',
    installs: 18900,
    rating: 4.0,
    featured: false,
  },
  {
    name: 'Discord Webhook',
    author: 'community-tools',
    description: 'Send outage alerts to Discord channels with embeds, role mentions, and severity-based color coding.',
    version: '1.2.0',
    category: 'Notification',
    installs: 24100,
    rating: 4.3,
    featured: false,
  },
  {
    name: 'Correlation Graph',
    author: 'analytics-pro',
    description: 'Network graph showing service dependencies and outage correlations. Identifies cascade failures and common root causes.',
    version: '1.0.5',
    category: 'Visualization',
    installs: 11200,
    rating: 4.4,
    featured: false,
  },
];

const tabs = ['All', 'Detection', 'Notification', 'Visualization'] as const;

export default function PluginsPage() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('All');

  const filtered = useMemo(() => {
    return plugins.filter((p) => {
      const matchesTab = activeTab === 'All' || p.category === activeTab;
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase()) ||
        p.author.toLowerCase().includes(search.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [search, activeTab]);

  const featured = plugins.filter((p) => p.featured);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="mb-10 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-4 py-1.5 text-sm font-medium text-purple-700 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
            <Puzzle className="h-4 w-4" />
            Plugin Marketplace
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-5xl">
            Extend OpenPulse
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            Discover community-built plugins for detection, notifications, and visualization.
            Install with one click or build your own.
          </p>
        </div>
      </section>

      {/* Featured Plugins */}
      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Featured Plugins
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((plugin) => (
            <PluginCard key={plugin.name} {...plugin} />
          ))}
        </div>
      </section>

      {/* Search & Filters */}
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plugins..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      {/* Plugin Grid */}
      <section className="mb-12">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-12 text-center dark:border-gray-700 dark:bg-gray-800/50">
            <Puzzle className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-400">
              No plugins found matching your search.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered
              .filter((p) => !p.featured)
              .map((plugin) => (
                <PluginCard key={plugin.name} {...plugin} />
              ))}
          </div>
        )}
      </section>

      {/* Create Plugin CTA */}
      <section className="rounded-xl border border-gray-200 bg-gradient-to-br from-purple-50 to-blue-50 p-8 text-center dark:border-gray-700 dark:from-purple-900/20 dark:to-blue-900/20">
        <BookOpen className="mx-auto h-8 w-8 text-purple-600 dark:text-purple-400" />
        <h3 className="mt-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Build Your Own Plugin
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
          Use the OpenPulse Plugin SDK to create custom detection, notification, or visualization plugins.
          Share them with the community through the marketplace.
        </p>
        <a
          href="/api-docs#plugins"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          <BookOpen className="h-4 w-4" />
          Plugin Documentation
        </a>
      </section>
    </div>
  );
}
