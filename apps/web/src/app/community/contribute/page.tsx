import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import ContributionForm from '@/components/ContributionForm';

export default function ContributePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/community"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Community
        </Link>
      </div>

      {/* Header */}
      <section className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
            <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
              Contribute a Service
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Submit a service to be monitored by OpenPulse. All submissions are reviewed before going live.
            </p>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="mb-12">
        <ContributionForm />
      </section>

      {/* Submission Guidelines */}
      <section>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Submission Guidelines
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
              The service must be publicly accessible and have a significant user base.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
              Provide the main service URL, not a documentation or marketing page.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
              If available, include the official status page URL for cross-referencing.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
              Descriptions should be factual and concise (under 500 characters).
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
              Reviews typically take 24-48 hours. You will be notified upon approval.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
