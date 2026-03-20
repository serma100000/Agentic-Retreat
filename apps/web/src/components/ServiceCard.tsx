import Link from 'next/link';
import { Globe, Cloud, Mail, MessageSquare, CreditCard, Tv, Database, MoreHorizontal } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';

interface ServiceCardProps {
  readonly service: {
    readonly name: string;
    readonly slug: string;
    readonly category: string;
    readonly currentStatus: 'operational' | 'degraded' | 'partial_outage' | 'major_outage';
  };
}

const categoryIcons: Record<string, React.ElementType> = {
  cloud: Cloud,
  cdn: Globe,
  dns: Globe,
  email: Mail,
  messaging: MessageSquare,
  payments: CreditCard,
  social: MessageSquare,
  streaming: Tv,
  storage: Database,
  other: MoreHorizontal,
};

export default function ServiceCard({ service }: ServiceCardProps) {
  const Icon = categoryIcons[service.category] ?? Globe;

  return (
    <Link
      href={`/services/${service.slug}`}
      className="card group flex items-center gap-4 transition-all hover:border-blue-300 dark:hover:border-blue-600"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-gray-700 dark:text-gray-400 dark:group-hover:bg-blue-900/30 dark:group-hover:text-blue-400">
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {service.name}
        </h3>
        <p className="text-xs capitalize text-gray-500 dark:text-gray-400">
          {service.category}
        </p>
      </div>
      <StatusBadge status={service.currentStatus} size="sm" />
    </Link>
  );
}
