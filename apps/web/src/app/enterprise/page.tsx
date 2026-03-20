'use client';

import Link from 'next/link';
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Building2,
  Users,
  MonitorCheck,
  Target,
  LayoutDashboard,
  Crown,
  ArrowRight,
} from 'lucide-react';

const orgData = {
  name: 'Acme Corporation',
  plan: 'Enterprise',
  members: 12,
  customMonitors: 8,
  slaTargets: 5,
  teamDashboards: 3,
};

const navCards = [
  {
    title: 'Team Management',
    description: 'Manage team members, roles, and invitations',
    href: '/enterprise/team',
    icon: Users,
    count: `${orgData.members} members`,
    color: 'blue',
  },
  {
    title: 'Custom Monitors',
    description: 'Configure custom endpoint monitoring and alerts',
    href: '/enterprise/monitors',
    icon: MonitorCheck,
    count: `${orgData.customMonitors} active`,
    color: 'green',
  },
  {
    title: 'SLA Targets',
    description: 'Track SLA compliance and error budgets',
    href: '/enterprise/sla',
    icon: Target,
    count: `${orgData.slaTargets} targets`,
    color: 'purple',
  },
  {
    title: 'Team Dashboards',
    description: 'Custom dashboards for your organization',
    href: '/enterprise/sla',
    icon: LayoutDashboard,
    count: `${orgData.teamDashboards} dashboards`,
    color: 'orange',
  },
];

const colorMap: Record<string, { bg: string; icon: string }> = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/30',
    icon: 'text-green-600 dark:text-green-400',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/30',
    icon: 'text-purple-600 dark:text-purple-400',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-900/30',
    icon: 'text-orange-600 dark:text-orange-400',
  },
};

const teamMembers = [
  { name: 'Sarah Chen', email: 'sarah@acme.com', role: 'Owner', avatar: 'SC' },
  { name: 'James Wilson', email: 'james@acme.com', role: 'Admin', avatar: 'JW' },
  { name: 'Emily Davis', email: 'emily@acme.com', role: 'Member', avatar: 'ED' },
  { name: 'Michael Brown', email: 'michael@acme.com', role: 'Member', avatar: 'MB' },
  { name: 'Lisa Garcia', email: 'lisa@acme.com', role: 'Viewer', avatar: 'LG' },
];

const roleColors: Record<string, string> = {
  Owner: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Admin: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Member: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  Viewer: 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

export default function EnterprisePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Org Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xl font-bold text-white">
            AC
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
                {orgData.name}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:from-amber-900/40 dark:to-yellow-900/40 dark:text-amber-300">
                <Crown className="h-3 w-3" />
                {orgData.plan}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Enterprise organization dashboard
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            {orgData.customMonitors}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Custom Monitors</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            {orgData.slaTargets}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">SLA Targets</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            {orgData.members}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Team Members</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            {orgData.teamDashboards}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Dashboards</p>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {navCards.map((card) => {
          const Icon = card.icon;
          const colors = colorMap[card.color];
          return (
            <Link
              key={card.title}
              href={card.href as any}
              className="card group flex items-start gap-4 transition-all hover:border-blue-300 dark:hover:border-blue-600"
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colors.bg}`}
              >
                <Icon className={`h-6 w-6 ${colors.icon}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {card.title}
                  </h3>
                  <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {card.description}
                </p>
                <span className="mt-2 inline-block text-xs font-medium text-gray-600 dark:text-gray-300">
                  {card.count}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Team Members Preview */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Team Members</h3>
          <Link
            href={"/enterprise/team" as any}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            View all
          </Link>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {teamMembers.map((member) => (
            <div
              key={member.email}
              className="flex items-center gap-3 py-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {member.avatar}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {member.name}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {member.email}
                </p>
              </div>
              <span
                className={`badge text-[10px] ${roleColors[member.role] ?? ''}`}
              >
                {member.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
