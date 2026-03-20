export { db, queryClient } from './connection.js';
export type { Database } from './connection.js';
export * as schema from './schema/index.js';

// Re-export individual tables and relations for convenience
export {
  serviceCategories,
  services,
  serviceRegions,
  serviceCategoriesRelations,
  servicesRelations,
  serviceRegionsRelations,
} from './schema/services.js';

export {
  reports,
  reportsRelations,
} from './schema/reports.js';

export {
  probeResults,
  probeResultsRelations,
} from './schema/probes.js';

export {
  outages,
  outageTimeline,
  outagesRelations,
  outageTimelineRelations,
} from './schema/outages.js';

export {
  users,
  apiKeys,
  notificationPreferences,
  usersRelations,
  apiKeysRelations,
  notificationPreferencesRelations,
} from './schema/users.js';
