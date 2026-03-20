import { Activity, AlertTriangle, BarChart3, CheckCircle2, Server } from 'lucide-react';
import OutageCard from '@/components/OutageCard';
import { getActiveOutages, getStats } from '@/lib/api';

export const revalidate = 30;

interface DashboardStats {
  totalServices: number;
  activeOutages: number;
  reportsToday: number;
}

async function fetchOutages() {
  try {
    return await getActiveOutages();
  } catch {
    return [];
  }
}

async function fetchStats(): Promise<DashboardStats> {
  try {
    return await getStats();
  } catch {
    return { totalServices: 0, activeOutages: 0, reportsToday: 0 };
  }
}

export default async function HomePage() {
  const [outages, stats] = await Promise.all([fetchOutages(), fetchStats()]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <section className="mb-12 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            <Activity className="h-4 w-4" />
            Real-time Monitoring
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-5xl">
            Real-time Service Status
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            Open-source, crowd-sourced outage detection. Monitor the services you depend on and
            get notified the moment something goes wrong.
          </p>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
            <Server className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
              {stats.totalServices}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Services Monitored</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/30">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
              {stats.activeOutages}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Active Outages</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/30">
            <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
              {stats.reportsToday}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Reports Today</p>
          </div>
        </div>
      </section>

      {/* Active Outages */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
            Active Outages
          </h2>
          {outages.length > 0 && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {outages.length} {outages.length === 1 ? 'outage' : 'outages'} detected
            </span>
          )}
        </div>

        {outages.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-green-200 bg-green-50 p-8 text-center dark:border-green-800 dark:bg-green-900/20">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
            <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">
              All Systems Operational
            </h3>
            <p className="mt-1 text-sm text-green-600 dark:text-green-500">
              No active outages detected. All monitored services are running normally.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {outages.map((outage) => (
              <OutageCard key={outage.id} outage={outage} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
