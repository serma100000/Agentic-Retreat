'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Globe } from 'lucide-react';

interface FormData {
  serviceName: string;
  url: string;
  category: string;
  description: string;
  statusPageUrl: string;
}

type UrlStatus = 'idle' | 'validating' | 'valid' | 'invalid';
type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error' | 'duplicate';

const categories = [
  'Cloud',
  'CDN',
  'DNS',
  'Email',
  'Messaging',
  'Payments',
  'Social',
  'Streaming',
  'Storage',
  'Developer Tools',
  'Analytics',
  'Security',
  'Other',
] as const;

function UrlIndicator({ status }: { readonly status: UrlStatus }) {
  switch (status) {
    case 'validating':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'valid':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'invalid':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return null;
  }
}

export default function ContributionForm() {
  const [form, setForm] = useState<FormData>({
    serviceName: '',
    url: '',
    category: '',
    description: '',
    statusPageUrl: '',
  });

  const [urlStatus, setUrlStatus] = useState<UrlStatus>('idle');
  const [statusUrlStatus, setStatusUrlStatus] = useState<UrlStatus>('idle');
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const urlTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const statusUrlTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const validateUrl = useCallback((url: string): boolean => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!form.url) {
      setUrlStatus('idle');
      return;
    }
    setUrlStatus('validating');
    clearTimeout(urlTimerRef.current);
    urlTimerRef.current = setTimeout(() => {
      setUrlStatus(validateUrl(form.url) ? 'valid' : 'invalid');
    }, 600);
    return () => clearTimeout(urlTimerRef.current);
  }, [form.url, validateUrl]);

  useEffect(() => {
    if (!form.statusPageUrl) {
      setStatusUrlStatus('idle');
      return;
    }
    setStatusUrlStatus('validating');
    clearTimeout(statusUrlTimerRef.current);
    statusUrlTimerRef.current = setTimeout(() => {
      setStatusUrlStatus(validateUrl(form.statusPageUrl) ? 'valid' : 'invalid');
    }, 600);
    return () => clearTimeout(statusUrlTimerRef.current);
  }, [form.statusPageUrl, validateUrl]);

  const updateField = useCallback(
    <K extends keyof FormData>(field: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
      if (submitStatus !== 'idle') setSubmitStatus('idle');
    },
    [submitStatus],
  );

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!form.serviceName.trim()) newErrors.serviceName = 'Service name is required';
    if (!form.url.trim()) newErrors.url = 'URL is required';
    else if (!validateUrl(form.url)) newErrors.url = 'Enter a valid URL';
    if (!form.category) newErrors.category = 'Select a category';
    if (!form.description.trim()) newErrors.description = 'Description is required';
    if (form.description.length > 500) newErrors.description = 'Description must be under 500 characters';
    if (form.statusPageUrl && !validateUrl(form.statusPageUrl))
      newErrors.statusPageUrl = 'Enter a valid URL or leave empty';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, validateUrl]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      setSubmitStatus('submitting');

      // Simulate duplicate check and submission
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Simulate a small chance of duplicate
      const slug = form.serviceName.toLowerCase().replace(/\s+/g, '-');
      const existingServices = ['github', 'aws', 'cloudflare', 'stripe', 'slack', 'google-cloud'];
      if (existingServices.includes(slug)) {
        setSubmitStatus('duplicate');
        return;
      }

      setSubmitStatus('success');
    },
    [form, validate],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-5">
      <form onSubmit={handleSubmit} className="space-y-5 lg:col-span-3">
        {/* Service Name */}
        <div className="space-y-1.5">
          <label htmlFor="serviceName" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Service Name <span className="text-red-500">*</span>
          </label>
          <input
            id="serviceName"
            type="text"
            value={form.serviceName}
            onChange={(e) => updateField('serviceName', e.target.value)}
            placeholder="e.g. Acme Cloud"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          {errors.serviceName && (
            <p className="text-xs text-red-500">{errors.serviceName}</p>
          )}
        </div>

        {/* URL */}
        <div className="space-y-1.5">
          <label htmlFor="serviceUrl" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            URL <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="serviceUrl"
              type="text"
              value={form.url}
              onChange={(e) => updateField('url', e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <UrlIndicator status={urlStatus} />
            </div>
          </div>
          {errors.url && <p className="text-xs text-red-500">{errors.url}</p>}
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <label htmlFor="category" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            id="category"
            value={form.category}
            onChange={(e) => updateField('category', e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat} value={cat.toLowerCase()}>
                {cat}
              </option>
            ))}
          </select>
          {errors.category && (
            <p className="text-xs text-red-500">{errors.category}</p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label htmlFor="description" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Brief description of the service and what it does..."
            rows={3}
            maxLength={500}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <div className="flex items-center justify-between">
            {errors.description ? (
              <p className="text-xs text-red-500">{errors.description}</p>
            ) : (
              <span />
            )}
            <span className="text-xs text-gray-400">{form.description.length}/500</span>
          </div>
        </div>

        {/* Status Page URL */}
        <div className="space-y-1.5">
          <label htmlFor="statusPageUrl" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Status Page URL <span className="text-gray-400">(optional)</span>
          </label>
          <div className="relative">
            <input
              id="statusPageUrl"
              type="text"
              value={form.statusPageUrl}
              onChange={(e) => updateField('statusPageUrl', e.target.value)}
              placeholder="https://status.example.com"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <UrlIndicator status={statusUrlStatus} />
            </div>
          </div>
          {errors.statusPageUrl && (
            <p className="text-xs text-red-500">{errors.statusPageUrl}</p>
          )}
        </div>

        {/* Submit */}
        <div className="pt-2">
          {submitStatus === 'duplicate' && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              A service with this name already exists in the database.
            </div>
          )}

          {submitStatus === 'error' && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
              <XCircle className="h-4 w-4 shrink-0" />
              Something went wrong. Please try again.
            </div>
          )}

          {submitStatus === 'success' ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Service submitted for review. Thank you for your contribution!
            </div>
          ) : (
            <button
              type="submit"
              disabled={submitStatus === 'submitting'}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 dark:focus:ring-offset-gray-900"
            >
              {submitStatus === 'submitting' && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {submitStatus === 'submitting' ? 'Submitting...' : 'Submit Service'}
            </button>
          )}
        </div>
      </form>

      {/* Preview */}
      <div className="lg:col-span-2">
        <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
          Preview
        </h3>
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              <Globe className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {form.serviceName || 'Service Name'}
              </h4>
              <p className="text-xs capitalize text-gray-500 dark:text-gray-400">
                {form.category || 'category'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Operational
            </span>
          </div>
          {form.description && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {form.description}
            </p>
          )}
          {form.url && (
            <p className="mt-2 truncate text-xs text-blue-500">{form.url}</p>
          )}
        </div>
      </div>
    </div>
  );
}
