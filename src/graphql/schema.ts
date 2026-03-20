/**
 * GraphQL Schema Definition Language (SDL) for the OpenPulse API.
 *
 * Defines all types, queries, mutations, and subscriptions
 * for the public-facing GraphQL endpoint.
 */

export const typeDefs = `#graphql
  enum OutageStatus {
    ACTIVE
    INVESTIGATING
    DEGRADED
    MAJOR_OUTAGE
    RECOVERING
    RESOLVED
  }

  enum ServiceStatus {
    OPERATIONAL
    INVESTIGATING
    DEGRADED
    MAJOR_OUTAGE
    RECOVERING
  }

  enum ReportType {
    WEBSITE_DOWN
    APP_NOT_WORKING
    SLOW_PERFORMANCE
    LOGIN_ISSUES
    PARTIAL_OUTAGE
    API_ERRORS
    OTHER
  }

  enum ApiTier {
    FREE
    PRO
    ENTERPRISE
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type ProbeStatus {
    success: Boolean!
    latencyMs: Float!
    statusCode: Int!
    checkedAt: String!
  }

  type TimelineEntry {
    id: ID!
    state: String!
    confidence: Float!
    createdAt: String!
    message: String
  }

  type Signal {
    source: String!
    score: Float!
    confidence: Float!
    timestamp: String!
  }

  type Report {
    id: ID!
    serviceSlug: String!
    type: String!
    description: String
    region: String
    createdAt: String!
  }

  type Service {
    id: ID!
    slug: String!
    name: String!
    category: String!
    url: String!
    status: ServiceStatus!
    confidence: Float!
    reportCount24h: Int!
    probeStatus: ProbeStatus
    outages(limit: Int, offset: Int): [Outage!]!
    recentReports(limit: Int): [Report!]!
  }

  type ServiceConnection {
    nodes: [Service!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type Outage {
    id: ID!
    service: Service!
    status: OutageStatus!
    confidence: Float!
    startedAt: String!
    resolvedAt: String
    duration: Int
    affectedRegions: [String!]!
    signals: [Signal!]!
    timeline: [TimelineEntry!]!
  }

  type OutageConnection {
    nodes: [Outage!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type OutageUpdate {
    serviceSlug: String!
    serviceName: String!
    state: String!
    previousState: String!
    confidence: Float!
    regions: [String!]!
    timestamp: String!
  }

  type ReportUpdate {
    serviceSlug: String!
    reportCount: Int!
    reportType: String!
    region: String!
    timestamp: String!
  }

  type OutageHistoryEntry {
    outageId: String!
    serviceSlug: String!
    serviceName: String!
    state: String!
    confidence: Float!
    startedAt: String!
    resolvedAt: String
    durationMs: Int!
    affectedRegions: [String!]!
  }

  type CategorySummaryEntry {
    category: String!
    totalOutages: Int!
    avgDurationMs: Float!
    avgMttd: Float!
    avgMttr: Float!
  }

  type TrendEntry {
    period: String!
    totalOutages: Int!
    avgDuration: Float!
    serviceCount: Int!
  }

  type ReliabilityEntry {
    serviceSlug: String!
    serviceName: String!
    uptimePercent: Float!
    totalOutages: Int!
    avgDuration: Float!
    mttr: Float!
    mttd: Float!
    rank: Int!
  }

  type Analytics {
    outageHistory: [OutageHistoryEntry!]!
    categorySummary: [CategorySummaryEntry!]!
    trends: [TrendEntry!]!
    reliability: [ReliabilityEntry!]!
  }

  type GlobalStats {
    totalServices: Int!
    activeOutages: Int!
    reportsToday: Int!
  }

  type ReportResult {
    success: Boolean!
    reportId: String
    message: String!
  }

  type NotificationPreference {
    id: ID!
    userId: String!
    channel: String!
    enabled: Boolean!
    serviceFilters: [String!]
    minSeverity: String
  }

  type ApiKeyResult {
    id: ID!
    key: String!
    name: String!
    tier: ApiTier!
    createdAt: String!
    expiresAt: String
  }

  input ReportInput {
    serviceSlug: String!
    type: ReportType!
    description: String
    region: String
  }

  input NotificationPreferenceInput {
    channel: String!
    enabled: Boolean!
    serviceFilters: [String!]
    minSeverity: String
  }

  input ApiKeyInput {
    name: String!
    tier: ApiTier
    expiresInDays: Int
  }

  type Query {
    services(
      category: String
      search: String
      limit: Int
      offset: Int
    ): ServiceConnection!

    service(slug: String!): Service

    outages(
      status: OutageStatus
      limit: Int
      offset: Int
    ): OutageConnection!

    outage(id: ID!): Outage

    analytics(
      serviceSlug: String
      category: String
      startDate: String
      endDate: String
    ): Analytics!
  }

  type Mutation {
    submitReport(input: ReportInput!): ReportResult!

    updateNotificationPreferences(
      input: NotificationPreferenceInput!
    ): NotificationPreference!

    createApiKey(input: ApiKeyInput!): ApiKeyResult!

    revokeApiKey(id: ID!): Boolean!
  }

  type Subscription {
    outageUpdated(serviceSlug: String): OutageUpdate!
    reportReceived(serviceSlug: String!): ReportUpdate!
    globalStats: GlobalStats!
  }
`;
