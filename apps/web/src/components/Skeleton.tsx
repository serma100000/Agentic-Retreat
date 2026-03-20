import { cn } from '@/lib/utils';

interface SkeletonProps {
  readonly className?: string;
}

function SkeletonBase({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gray-200 dark:bg-gray-700',
        className,
      )}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="card">
      <div className="flex items-center gap-4">
        <SkeletonBase className="h-12 w-12 rounded-lg" />
        <div className="flex-1 space-y-2">
          <SkeletonBase className="h-4 w-3/4" />
          <SkeletonBase className="h-3 w-1/2" />
        </div>
        <SkeletonBase className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="card">
      <SkeletonBase className="mb-4 h-4 w-48" />
      <SkeletonBase className="h-72 w-full rounded-lg" />
    </div>
  );
}

export function SkeletonText({ lines = 3 }: { readonly lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBase
          key={i}
          className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}
