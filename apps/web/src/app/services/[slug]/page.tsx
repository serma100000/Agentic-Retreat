import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Clock, Globe } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import ReportButton from '@/components/ReportButton';
import ReportChart from '@/components/ReportChart';
import { getService, getServiceReports, getActiveOutages, type TimeSeries } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export const revalidate = 30;

interface ServiceDetailPageProps {
  readonly params: Promise<{ slug: string }>;
}

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { slug } = await params;

  let service;
  try {
    service = await getService(slug);
  } catch {
    notFound();
  }

  let reportData: TimeSeries[] = [];
  try {
    reportData = await getServiceReports(slug, '24h');
  } catch {
    reportData = [];
  }

  let serviceOutages: Awaited<ReturnType<typeof getActiveOutages>> = [];
  try {
    const allOutages = await getActiveOutages();
    serviceOutages = allOutages.filter((o) => o.serviceId === service.id);
  } catch {
    serviceOutages = [];
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <Link
        href="/services"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Services
      </Link>

      {/* Service Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
              {service.name}
            </h1>
            <StatusBadge status={service.currentStatus} size="lg" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1 capitalize">
              <Globe className="h-4 w-4" />
              {service.category}
            </span>
            {service.homepageUrl && (
              <a
                href={service.homepageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Website
              </a>
            )}
            {service.regions.length > 0 && (
              <span>
                {service.regions.length} {service.regions.length === 1 ? 'region' : 'regions'}
              </span>
            )}
          </div>
        </div>

        <ReportButton serviceSlug={slug} />
      </div>

      {/* Report Chart */}
      {reportData.length > 0 && (
        <div className="mb-8">
          <ReportChart data={reportData} serviceName={service.name} />
        </div>
      )}

      {/* Active Outages for this Service */}
      {serviceOutages.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
            Active Outages
          </h2>
          <div className="space-y-3">
            {serviceOutages.map((outage) => (
              <div
                key={outage.id}
                className="card border-l-4 border-l-red-400"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {outage.title}
                    </h3>
                    {outage.summary && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {outage.summary}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Started {formatDate(outage.startedAt)}
                      </span>
                      <span>{outage.reportCount} reports</span>
                      {outage.affectedRegions.length > 0 && (
                        <span>{outage.affectedRegions.join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <StatusBadge
                    status={outage.state as 'suspected' | 'confirmed' | 'monitoring' | 'resolving' | 'resolved'}
                    size="sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Service Info */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
          Service Information
        </h2>
        <div className="card">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Category</dt>
              <dd className="mt-1 text-sm capitalize text-gray-900 dark:text-gray-100">
                {service.category}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Regions</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {service.regions.length > 0 ? service.regions.join(', ') : 'Global'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
              <dd className="mt-1">
                <StatusBadge status={service.currentStatus} size="sm" />
              </dd>
            </div>
            {service.statusPageUrl && (
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Official Status Page
                </dt>
                <dd className="mt-1">
                  <a
                    href={service.statusPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </section>
    </div>
  );
}
