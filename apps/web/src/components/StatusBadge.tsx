import { cn } from '@/lib/utils';

type Status =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
  | 'suspected'
  | 'confirmed'
  | 'monitoring'
  | 'resolving'
  | 'resolved';

interface StatusBadgeProps {
  readonly status: Status;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly showLabel?: boolean;
}

const statusConfig: Record<Status, { label: string; dotClass: string; bgClass: string }> = {
  operational: {
    label: 'Operational',
    dotClass: 'bg-green-500',
    bgClass: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  degraded: {
    label: 'Degraded',
    dotClass: 'bg-orange-500',
    bgClass: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
  partial_outage: {
    label: 'Partial Outage',
    dotClass: 'bg-yellow-500',
    bgClass: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  major_outage: {
    label: 'Major Outage',
    dotClass: 'bg-red-500',
    bgClass: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  suspected: {
    label: 'Suspected',
    dotClass: 'bg-yellow-500',
    bgClass: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  confirmed: {
    label: 'Confirmed',
    dotClass: 'bg-red-500',
    bgClass: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  monitoring: {
    label: 'Monitoring',
    dotClass: 'bg-blue-500',
    bgClass: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  resolving: {
    label: 'Resolving',
    dotClass: 'bg-blue-500',
    bgClass: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  resolved: {
    label: 'Resolved',
    dotClass: 'bg-gray-400',
    bgClass: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
};

const sizeClasses = {
  sm: { badge: 'px-2 py-0.5 text-xs', dot: 'h-1.5 w-1.5' },
  md: { badge: 'px-3 py-1 text-xs', dot: 'h-2 w-2' },
  lg: { badge: 'px-3.5 py-1.5 text-sm', dot: 'h-2.5 w-2.5' },
};

export default function StatusBadge({ status, size = 'md', showLabel = true }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.operational;
  const sizes = sizeClasses[size];

  return (
    <span
      className={cn(
        'badge',
        config.bgClass,
        sizes.badge,
      )}
    >
      <span className={cn('rounded-full', config.dotClass, sizes.dot)} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
