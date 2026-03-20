import Link from 'next/link';
import {
  Users, Server, Puzzle, Plus, Github, MessageCircle,
  BookOpen, CheckCircle2, ArrowRight, Heart,
} from 'lucide-react';

const stats = [
  { label: 'Contributors', value: '1,247', icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
  { label: 'Services Added', value: '342', icon: Server, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  { label: 'Plugins Published', value: '89', icon: Puzzle, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30' },
];

const recentContributions = [
  { service: 'Render', contributor: 'sarah-dev', category: 'Cloud', date: '2026-03-19' },
  { service: 'Neon Database', contributor: 'pgfan42', category: 'Storage', date: '2026-03-18' },
  { service: 'Resend', contributor: 'mailops', category: 'Email', date: '2026-03-17' },
  { service: 'Turso', contributor: 'edge-db', category: 'Storage', date: '2026-03-16' },
  { service: 'Fly.io', contributor: 'devops-mike', category: 'Cloud', date: '2026-03-15' },
  { service: 'Upstash', contributor: 'serverless-fan', category: 'Storage', date: '2026-03-14' },
  { service: 'Railway', contributor: 'deploy-pro', category: 'Cloud', date: '2026-03-13' },
  { service: 'Loops', contributor: 'email-expert', category: 'Email', date: '2026-03-12' },
];

const guidelines = [
  'Be respectful and constructive in all interactions.',
  'Only submit services you have verified are real and publicly accessible.',
  'Provide accurate descriptions and categorizations.',
  'Do not submit duplicate services -- check existing entries first.',
  'Report any inaccurate data you find in the database.',
  'Follow the code of conduct when contributing code or plugins.',
];

export default function CommunityPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="mb-12 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-pink-200 bg-pink-50 px-4 py-1.5 text-sm font-medium text-pink-700 dark:border-pink-800 dark:bg-pink-900/30 dark:text-pink-300">
            <Heart className="h-4 w-4" />
            Community Driven
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-5xl">
            Built by the Community
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            OpenPulse is powered by contributors like you. Add services, build plugins,
            report outages, and help make the internet more transparent.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.bg}`}>
                <Icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                  {stat.value}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* Add a Service CTA */}
      <section className="mb-12">
        <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-8 dark:border-blue-800 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <Plus className="h-7 w-7" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Add a Service
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Know a service that should be monitored? Submit it for review and help expand
                our coverage. The process takes less than a minute.
              </p>
              <Link
                href="/community/contribute"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Contribute a Service
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Contributions */}
      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Recent Contributions
        </h2>
        <div className="card overflow-hidden p-0">
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {recentContributions.map((contrib) => (
              <div
                key={contrib.service}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {contrib.service}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      by {contrib.contributor}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400 sm:inline-flex">
                    {contrib.category}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {contrib.date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community Guidelines */}
      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Community Guidelines
        </h2>
        <div className="card">
          <ul className="space-y-3">
            {guidelines.map((rule) => (
              <li key={rule} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Links */}
      <section className="grid gap-4 sm:grid-cols-3">
        <a
          href="https://github.com/openpulse"
          target="_blank"
          rel="noopener noreferrer"
          className="card group flex items-center gap-4 transition-all hover:border-gray-400 dark:hover:border-gray-500"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-colors group-hover:bg-gray-900 group-hover:text-white dark:bg-gray-700 dark:text-gray-300 dark:group-hover:bg-gray-600">
            <Github className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">GitHub</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Source code &amp; issues</p>
          </div>
        </a>
        <a
          href="https://discord.gg/openpulse"
          target="_blank"
          rel="noopener noreferrer"
          className="card group flex items-center gap-4 transition-all hover:border-indigo-300 dark:hover:border-indigo-600"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white dark:bg-indigo-900/30 dark:text-indigo-400 dark:group-hover:bg-indigo-700">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Discord</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Chat with the community</p>
          </div>
        </a>
        <a
          href="https://forum.openpulse.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="card group flex items-center gap-4 transition-all hover:border-amber-300 dark:hover:border-amber-600"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-600 group-hover:text-white dark:bg-amber-900/30 dark:text-amber-400 dark:group-hover:bg-amber-700">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Forum</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Discussions &amp; proposals</p>
          </div>
        </a>
      </section>
    </div>
  );
}
