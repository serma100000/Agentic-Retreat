'use client';

import { useState, useCallback } from 'react';
import { Star, Download, Loader2, ExternalLink } from 'lucide-react';

interface PluginCardProps {
  readonly name: string;
  readonly author: string;
  readonly description: string;
  readonly version: string;
  readonly category: 'Detection' | 'Notification' | 'Visualization' | string;
  readonly installs: number;
  readonly rating: number;
  readonly featured?: boolean;
}

const categoryColors: Record<string, string> = {
  Detection: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Notification: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Visualization: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

function formatInstalls(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function StarRating({ rating }: { readonly rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < Math.round(rating)
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-gray-300 dark:text-gray-600'
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

export default function PluginCard({
  name,
  author,
  description,
  version,
  category,
  installs,
  rating,
  featured = false,
}: PluginCardProps) {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    // Simulate install
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setInstalling(false);
    setInstalled(true);
  }, []);

  const badgeClass =
    categoryColors[category] ??
    'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-400';

  return (
    <div
      className={`card relative flex flex-col gap-4 transition-all hover:border-blue-300 dark:hover:border-blue-600 ${
        featured ? 'ring-2 ring-blue-500/20' : ''
      }`}
    >
      {featured && (
        <div className="absolute -top-2.5 left-4 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          Featured
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            by {author}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
          {category}
        </span>
      </div>

      <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
        {description}
      </p>

      <div className="flex items-center gap-4">
        <StarRating rating={rating} />
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <Download className="h-3 w-3" />
          {formatInstalls(installs)}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          v{version}
        </span>
      </div>

      <div className="flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing || installed}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-gray-900 ${
            installed
              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60'
          }`}
        >
          {installing && <Loader2 className="h-4 w-4 animate-spin" />}
          {installed ? 'Installed' : installing ? 'Installing...' : 'Install'}
        </button>
        <a
          href={`/docs/plugins/${name.toLowerCase().replace(/\s+/g, '-')}`}
          className="rounded-lg border border-gray-300 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label="View documentation"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
