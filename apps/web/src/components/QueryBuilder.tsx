'use client';

import { useState, useCallback } from 'react';
import { Search, Download, Eye, X, Loader2 } from 'lucide-react';
import DateRangePicker from '@/components/DateRangePicker';

interface QueryParams {
  startDate: string;
  endDate: string;
  services: string[];
  categories: string[];
  severity: string[];
  format: 'json' | 'csv';
}

const availableServices = [
  'AWS', 'Google Cloud', 'Azure', 'Cloudflare', 'GitHub',
  'Stripe', 'Slack', 'Vercel', 'Datadog', 'PagerDuty',
  'Twilio', 'SendGrid', 'MongoDB Atlas', 'Supabase', 'Netlify',
];

const availableCategories = [
  'Cloud', 'CDN', 'DNS', 'Email', 'Messaging',
  'Payments', 'Social', 'Streaming', 'Storage', 'Developer Tools',
];

const severityLevels = ['Critical', 'Major', 'Minor', 'Informational'];

const sampleResults = [
  { service: 'AWS', status: 'major_outage', duration: '47m', confidence: 0.94, date: '2026-03-18', regions: ['us-east-1', 'eu-west-1'] },
  { service: 'GitHub', status: 'degraded', duration: '23m', confidence: 0.87, date: '2026-03-17', regions: ['global'] },
  { service: 'Cloudflare', status: 'partial_outage', duration: '12m', confidence: 0.91, date: '2026-03-16', regions: ['asia-east'] },
];

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

export default function QueryBuilder() {
  const [query, setQuery] = useState<QueryParams>({
    startDate: formatDateISO(new Date(Date.now() - 30 * 86400000)),
    endDate: formatDateISO(new Date()),
    services: [],
    categories: [],
    severity: [],
    format: 'json',
  });

  const [serviceSearch, setServiceSearch] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filteredServices = availableServices.filter(
    (s) => s.toLowerCase().includes(serviceSearch.toLowerCase()) && !query.services.includes(s),
  );

  const toggleService = useCallback((service: string) => {
    setQuery((prev) => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter((s) => s !== service)
        : [...prev.services, service],
    }));
  }, []);

  const removeService = useCallback((service: string) => {
    setQuery((prev) => ({
      ...prev,
      services: prev.services.filter((s) => s !== service),
    }));
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setQuery((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat],
    }));
  }, []);

  const toggleSeverity = useCallback((sev: string) => {
    setQuery((prev) => ({
      ...prev,
      severity: prev.severity.includes(sev)
        ? prev.severity.filter((s) => s !== sev)
        : [...prev.severity, sev],
    }));
  }, []);

  const handleDateChange = useCallback((start: string, end: string) => {
    setQuery((prev) => ({ ...prev, startDate: start, endDate: end }));
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setExporting(false);

    const params = new URLSearchParams({
      start: query.startDate,
      end: query.endDate,
      format: query.format,
    });
    if (query.services.length > 0) params.set('services', query.services.join(','));
    if (query.categories.length > 0) params.set('categories', query.categories.join(','));
    if (query.severity.length > 0) params.set('severity', query.severity.join(','));

    // In production, this would trigger a download
    window.open(`/api/v1/open/export?${params.toString()}`, '_blank');
  }, [query]);

  return (
    <div className="space-y-6">
      {/* Date Range */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Date Range
        </h3>
        <DateRangePicker
          startDate={query.startDate}
          endDate={query.endDate}
          onChange={handleDateChange}
        />
      </div>

      {/* Service Search & Multi-Select */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Services
        </h3>
        {query.services.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {query.services.map((svc) => (
              <span
                key={svc}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              >
                {svc}
                <button
                  type="button"
                  onClick={() => removeService(svc)}
                  className="rounded-full p-0.5 hover:bg-blue-100 dark:hover:bg-blue-800/50"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
            placeholder="Search services..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>
        {serviceSearch && filteredServices.length > 0 && (
          <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            {filteredServices.slice(0, 8).map((svc) => (
              <button
                key={svc}
                type="button"
                onClick={() => {
                  toggleService(svc);
                  setServiceSearch('');
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {svc}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category Filters */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Categories
        </h3>
        <div className="flex flex-wrap gap-2">
          {availableCategories.map((cat) => (
            <label
              key={cat}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700 dark:border-gray-600 dark:has-[:checked]:border-blue-600 dark:has-[:checked]:bg-blue-900/30 dark:has-[:checked]:text-blue-300"
            >
              <input
                type="checkbox"
                checked={query.categories.includes(cat)}
                onChange={() => toggleCategory(cat)}
                className="sr-only"
              />
              {cat}
            </label>
          ))}
        </div>
      </div>

      {/* Severity Filter */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Severity
        </h3>
        <div className="flex flex-wrap gap-2">
          {severityLevels.map((sev) => (
            <label
              key={sev}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700 dark:border-gray-600 dark:has-[:checked]:border-blue-600 dark:has-[:checked]:bg-blue-900/30 dark:has-[:checked]:text-blue-300"
            >
              <input
                type="checkbox"
                checked={query.severity.includes(sev)}
                onChange={() => toggleSeverity(sev)}
                className="sr-only"
              />
              {sev}
            </label>
          ))}
        </div>
      </div>

      {/* Format Selector */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Export Format
        </h3>
        <div className="flex gap-3">
          {(['json', 'csv'] as const).map((fmt) => (
            <label
              key={fmt}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                query.format === fmt
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              <input
                type="radio"
                name="format"
                value={fmt}
                checked={query.format === fmt}
                onChange={() => setQuery((prev) => ({ ...prev, format: fmt }))}
                className="sr-only"
              />
              {fmt.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setShowPreview((prev) => !prev)}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Eye className="h-4 w-4" />
          Preview
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {exporting ? 'Exporting...' : 'Export Data'}
        </button>
      </div>

      {/* Preview Panel */}
      {showPreview && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            Sample Results
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Service</th>
                  <th className="pb-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Status</th>
                  <th className="pb-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Duration</th>
                  <th className="pb-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Confidence</th>
                  <th className="pb-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Date</th>
                  <th className="pb-2 font-medium text-gray-500 dark:text-gray-400">Regions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sampleResults.map((row) => (
                  <tr key={`${row.service}-${row.date}`}>
                    <td className="py-2 pr-4 font-medium text-gray-900 dark:text-gray-100">{row.service}</td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        {row.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{row.duration}</td>
                    <td className="py-2 pr-4 font-mono text-gray-700 dark:text-gray-300">{(row.confidence * 100).toFixed(0)}%</td>
                    <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{row.date}</td>
                    <td className="py-2 text-gray-700 dark:text-gray-300">{row.regions.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Showing 3 sample records. Full export will include all matching results.
          </p>
        </div>
      )}
    </div>
  );
}
