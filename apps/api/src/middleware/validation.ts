/**
 * Zod schemas for request/response validation.
 */

import { z } from 'zod';

export const ReportSubmissionSchema = z.object({
  service_slug: z
    .string()
    .min(1, 'service_slug is required')
    .max(200, 'service_slug too long')
    .regex(/^[a-z0-9-]+$/, 'service_slug must be lowercase alphanumeric with hyphens'),
  report_type: z.enum(['outage', 'degraded', 'operational'], {
    errorMap: () => ({ message: 'report_type must be outage, degraded, or operational' }),
  }),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  source: z.enum(['web', 'mobile', 'api'], {
    errorMap: () => ({ message: 'source must be web, mobile, or api' }),
  }),
});

export type ReportSubmission = z.infer<typeof ReportSubmissionSchema>;

export const ServiceQuerySchema = z.object({
  category: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
});

export type ServiceQuery = z.infer<typeof ServiceQuerySchema>;

export const TimeSeriesQuerySchema = z.object({
  interval: z.enum(['1m', '5m', '1h', '1d'], {
    errorMap: () => ({ message: 'interval must be 1m, 5m, 1h, or 1d' }),
  }),
  start: z
    .string()
    .datetime({ message: 'start must be an ISO 8601 datetime' })
    .optional(),
  end: z
    .string()
    .datetime({ message: 'end must be an ISO 8601 datetime' })
    .optional(),
});

export type TimeSeriesQuery = z.infer<typeof TimeSeriesQuerySchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
