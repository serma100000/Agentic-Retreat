'use client';

import { useState } from 'react';
import Link from 'next/link';
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ArrowLeft,
  UserPlus,
  Trash2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
  avatar: string;
}

const roles = ['Owner', 'Admin', 'Member', 'Viewer'] as const;

const initialMembers: TeamMember[] = [
  { id: '1', name: 'Sarah Chen', email: 'sarah@acme.com', role: 'Owner', joinedAt: '2024-03-15', avatar: 'SC' },
  { id: '2', name: 'James Wilson', email: 'james@acme.com', role: 'Admin', joinedAt: '2024-06-01', avatar: 'JW' },
  { id: '3', name: 'Emily Davis', email: 'emily@acme.com', role: 'Member', joinedAt: '2024-07-20', avatar: 'ED' },
  { id: '4', name: 'Michael Brown', email: 'michael@acme.com', role: 'Member', joinedAt: '2024-09-10', avatar: 'MB' },
  { id: '5', name: 'Lisa Garcia', email: 'lisa@acme.com', role: 'Viewer', joinedAt: '2024-11-02', avatar: 'LG' },
  { id: '6', name: 'David Kim', email: 'david@acme.com', role: 'Member', joinedAt: '2025-01-08', avatar: 'DK' },
  { id: '7', name: 'Anna Petrova', email: 'anna@acme.com', role: 'Member', joinedAt: '2025-02-14', avatar: 'AP' },
  { id: '8', name: 'Robert Taylor', email: 'robert@acme.com', role: 'Viewer', joinedAt: '2025-03-01', avatar: 'RT' },
];

const maxMembers = 25;

const roleColors: Record<string, string> = {
  Owner: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Admin: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Member: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  Viewer: 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('Member');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    const initials = inviteEmail
      .split('@')[0]
      .split('.')
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2);

    const newMember: TeamMember = {
      id: Date.now().toString(),
      name: inviteEmail.split('@')[0].replace('.', ' '),
      email: inviteEmail,
      role: inviteRole,
      joinedAt: new Date().toISOString().split('T')[0],
      avatar: initials || '??',
    };

    setMembers((prev) => [...prev, newMember]);
    setInviteEmail('');
    setInviteRole('Member');
    setShowInviteForm(false);
  }

  function handleRoleChange(memberId: string, newRole: string) {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
    );
  }

  function handleRemove(memberId: string) {
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    setConfirmDelete(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={"/enterprise" as any}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Enterprise
      </Link>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            Team Management
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Manage members, roles, and access for your organization.
          </p>
        </div>
        <button
          onClick={() => setShowInviteForm(!showInviteForm)}
          className="btn-primary gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Invite Member
        </button>
      </div>

      {/* Plan Limits */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Team members used
            </span>
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {members.length} / {maxMembers}
          </span>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-2 rounded-full bg-blue-600 transition-all dark:bg-blue-500"
            style={{ width: `${(members.length / maxMembers) * 100}%` }}
          />
        </div>
      </div>

      {/* Invite Form */}
      {showInviteForm && (
        <div className="card mb-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
            Invite a Team Member
          </h3>
          <form onSubmit={handleInvite} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                htmlFor="invite-email"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email address
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div className="w-full sm:w-40">
              <label
                htmlFor="invite-role"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {roles.filter((r) => r !== 'Owner').map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary whitespace-nowrap">
              Send Invite
            </button>
          </form>
        </div>
      )}

      {/* Members Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Member</th>
                <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Email</th>
                <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Role</th>
                <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Joined</th>
                <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {member.avatar}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {member.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">{member.email}</td>
                  <td className="py-3 pr-4">
                    {member.role === 'Owner' ? (
                      <span className={cn('badge text-[10px]', roleColors[member.role])}>
                        {member.role}
                      </span>
                    ) : (
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value)}
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      >
                        {roles.filter((r) => r !== 'Owner').map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-500 dark:text-gray-400">
                    {new Date(member.joinedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="py-3">
                    {member.role !== 'Owner' && (
                      <>
                        {confirmDelete === member.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRemove(member.id)}
                              className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(member.id)}
                            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                            title="Remove member"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
