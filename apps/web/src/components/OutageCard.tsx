import { AlertTriangle, MapPin, Clock } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { formatDuration, formatConfidence } from '@/lib/utils';

interface OutageCardProps {
  readonly outage: {
    readonly id: string;
    readonly serviceName: string;
    readonly state: string;
    readonly severity: string;
    readonly title: string;
    readonly confidence: number;
    readonly affectedRegions: readonly string[];
    readonly startedAt: string;
    readonly reportCount: number;
  };
}

const severityColors: Record<string, string> = {
  minor: 'border-l-yellow-400',
  moderate: 'border-l-orange-400',
  major: 'border-l-red-400',
  critical: 'border-l-red-600',
};

export default function OutageCard({ outage }: OutageCardProps) {
  const borderColor = severityColors[outage.severity] ?? 'border-l-gray-400';

  return (
    <div className={`card border-l-4 ${borderColor}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
            <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {outage.serviceName}
            </h3>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {outage.title}
          </p>
        </div>
        <StatusBadge
          status={outage.state as 'suspected' | 'confirmed' | 'monitoring' | 'resolving' | 'resolved'}
          size="sm"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            Confidence:
          </span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {formatConfidence(outage.confidence)}
          </span>
        </span>

        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {formatDuration(outage.startedAt)}
        </span>

        {outage.affectedRegions.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {outage.affectedRegions.slice(0, 3).join(', ')}
            {outage.affectedRegions.length > 3 && (
              <span> +{outage.affectedRegions.length - 3} more</span>
            )}
          </span>
        )}

        <span className="inline-flex items-center gap-1">
          {outage.reportCount} {outage.reportCount === 1 ? 'report' : 'reports'}
        </span>
      </div>
    </div>
  );
}
