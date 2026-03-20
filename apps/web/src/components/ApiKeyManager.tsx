'use client';

import { useState, useCallback } from 'react';
import { Key, Plus, Copy, Trash2, Check, X, Eye, EyeOff, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

const AVAILABLE_SCOPES = [
  { value: 'read:services', label: 'Read Services', description: 'View service status' },
  { value: 'read:outages', label: 'Read Outages', description: 'View outage data' },
  { value: 'write:reports', label: 'Submit Reports', description: 'Submit outage reports' },
  { value: 'read:stats', label: 'Read Stats', description: 'Access statistics' },
  { value: 'manage:notifications', label: 'Manage Notifications', description: 'Manage notification preferences' },
];

const MOCK_KEYS: ApiKey[] = [
  {
    id: '1',
    name: 'Production Monitoring',
    prefix: 'op_live_a3f8',
    scopes: ['read:services', 'read:outages', 'read:stats'],
    createdAt: '2026-02-15T10:30:00Z',
    lastUsedAt: '2026-03-20T08:15:00Z',
  },
  {
    id: '2',
    name: 'CI/CD Pipeline',
    prefix: 'op_live_7b2c',
    scopes: ['read:services', 'write:reports'],
    createdAt: '2026-03-01T14:00:00Z',
    lastUsedAt: '2026-03-19T22:45:00Z',
  },
];

export default function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>(MOCK_KEYS);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [visiblePrefixes, setVisiblePrefixes] = useState<Set<string>>(new Set());

  const toggleScope = useCallback((scope: string) => {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }, []);

  const handleCreate = useCallback(() => {
    if (!newKeyName.trim() || newKeyScopes.length === 0) return;

    const randomHex = Math.random().toString(16).slice(2, 6);
    const fullKey = `op_live_${randomHex}_${Math.random().toString(36).slice(2, 34)}`;
    const prefix = `op_live_${randomHex}`;

    const newKey: ApiKey = {
      id: Math.random().toString(36).slice(2),
      name: newKeyName.trim(),
      prefix,
      scopes: [...newKeyScopes],
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };

    setKeys((prev) => [newKey, ...prev]);
    setCreatedKey(fullKey);
    setNewKeyName('');
    setNewKeyScopes([]);
  }, [newKeyName, newKeyScopes]);

  const handleDelete = useCallback((id: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    setDeleteConfirm(null);
  }, []);

  const handleCopyKey = useCallback(async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      const textArea = document.createElement('textarea');
      textArea.value = key;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  }, []);

  const togglePrefixVisibility = useCallback((id: string) => {
    setVisiblePrefixes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <Key className="h-5 w-5" />
            API Keys
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage API keys for programmatic access to OpenPulse.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreateModal(true);
            setCreatedKey(null);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Create Key
        </button>
      </div>

      {/* Key list */}
      {keys.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center dark:border-gray-700">
          <Key className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No API keys</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
            Create your first API key to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((apiKey) => (
            <div
              key={apiKey.id}
              className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {apiKey.name}
                    </h3>
                    <Shield className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      {visiblePrefixes.has(apiKey.id) ? apiKey.prefix : `${apiKey.prefix.slice(0, 7)}${'*'.repeat(8)}`}
                    </code>
                    <button
                      type="button"
                      onClick={() => togglePrefixVisibility(apiKey.id)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {visiblePrefixes.has(apiKey.id) ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {deleteConfirm === apiKey.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600 dark:text-red-400">Revoke?</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(apiKey.id)}
                      className="rounded-md bg-red-100 p-1.5 text-red-600 transition-colors hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(null)}
                      className="rounded-md bg-gray-100 p-1.5 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(apiKey.id)}
                    className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    title="Revoke key"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {apiKey.scopes.map((scope) => (
                  <span
                    key={scope}
                    className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  >
                    {scope}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                <span>Created: {formatDate(apiKey.createdAt)}</span>
                <span>
                  Last used: {apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : 'Never'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            {createdKey ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-500" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Key Created
                  </h3>
                </div>
                <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                  Copy your API key now. It will not be shown again.
                </p>
                <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
                  <code className="flex-1 break-all font-mono text-xs text-gray-800 dark:text-gray-200">
                    {createdKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyKey(createdKey)}
                    className="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    {copiedKey ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreatedKey(null);
                  }}
                  className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Create API Key
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-md p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="key-name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Key Name
                    </label>
                    <input
                      id="key-name"
                      type="text"
                      placeholder="e.g. Production Monitoring"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Scopes
                    </p>
                    <div className="space-y-2">
                      {AVAILABLE_SCOPES.map((scope) => (
                        <label
                          key={scope.value}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                            newKeyScopes.includes(scope.value)
                              ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                              : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={newKeyScopes.includes(scope.value)}
                            onChange={() => toggleScope(scope.value)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {scope.label}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {scope.description}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!newKeyName.trim() || newKeyScopes.length === 0}
                    className={cn(
                      'flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
                      newKeyName.trim() && newKeyScopes.length > 0
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'cursor-not-allowed bg-blue-300 dark:bg-blue-800',
                    )}
                  >
                    Create Key
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
