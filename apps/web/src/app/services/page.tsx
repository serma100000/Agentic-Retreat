'use client';

import { useState, useCallback, useEffect } from 'react';
import { Layers } from 'lucide-react';
import ServiceCard from '@/components/ServiceCard';
import SearchInput from '@/components/SearchInput';
import Pagination from '@/components/Pagination';
import { SkeletonCard } from '@/components/Skeleton';
import { getServices, type ServiceResponse } from '@/lib/api';
import { cn } from '@/lib/utils';

const categories = [
  { value: 'all', label: 'All' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'social', label: 'Social' },
  { value: 'streaming', label: 'Streaming' },
  { value: 'payments', label: 'Banking' },
  { value: 'email', label: 'Email' },
  { value: 'messaging', label: 'Messaging' },
  { value: 'cdn', label: 'CDN' },
  { value: 'dns', label: 'DNS' },
  { value: 'storage', label: 'Storage' },
  { value: 'other', label: 'Other' },
];

export default function ServicesPage() {
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getServices({
        page,
        limit: 12,
        category: category === 'all' ? undefined : category,
        search: search || undefined,
      });
      setServices(result.items);
      setTotalPages(result.pagination.totalPages);
    } catch {
      setServices([]);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [page, category, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleCategoryChange = useCallback((value: string) => {
    setCategory(value);
    setPage(1);
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Layers className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Services</h1>
        </div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Browse and monitor the status of cloud services and platforms.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="max-w-md">
          <SearchInput onSearch={handleSearch} />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => handleCategoryChange(cat.value)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                category === cat.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Service Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center dark:border-gray-700">
          <Layers className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">
            No services found
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Try adjusting your search or filter criteria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="mt-8">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
