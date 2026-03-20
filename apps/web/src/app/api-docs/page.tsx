'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Code2,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
  Key,
  Gauge,
  BookOpen,
} from 'lucide-react';

type ApiTab = 'rest' | 'graphql';

const restEndpoints = [
  {
    method: 'GET',
    path: '/api/v1/services',
    description: 'List all monitored services',
    auth: false,
    request: 'GET /api/v1/services?page=1&limit=20&category=cloud&search=aws',
    response: `{
  "success": true,
  "data": {
    "items": [
      {
        "id": "svc_abc123",
        "name": "AWS",
        "slug": "aws",
        "category": "cloud",
        "currentStatus": "operational",
        "regions": ["us-east-1", "eu-west-1"]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 45,
      "totalPages": 3,
      "hasNext": true,
      "hasPrev": false
    }
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/services/:slug',
    description: 'Get details for a specific service',
    auth: false,
    request: 'GET /api/v1/services/aws',
    response: `{
  "success": true,
  "data": {
    "id": "svc_abc123",
    "name": "AWS",
    "slug": "aws",
    "category": "cloud",
    "homepageUrl": "https://aws.amazon.com",
    "statusPageUrl": "https://health.aws.amazon.com",
    "currentStatus": "operational",
    "regions": ["us-east-1", "us-west-2", "eu-west-1"]
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/outages',
    description: 'List outages with optional state filter',
    auth: false,
    request: 'GET /api/v1/outages?state=active&page=1&limit=10',
    response: `{
  "success": true,
  "data": [
    {
      "id": "out_xyz789",
      "serviceId": "svc_abc123",
      "serviceName": "AWS",
      "state": "confirmed",
      "severity": "major",
      "title": "AWS S3 Outage - US East",
      "affectedRegions": ["us-east-1"],
      "confidence": 0.95,
      "reportCount": 142,
      "startedAt": "2026-03-20T10:30:00Z",
      "resolvedAt": null
    }
  ]
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/outages/:id',
    description: 'Get outage detail with timeline',
    auth: false,
    request: 'GET /api/v1/outages/out_xyz789',
    response: `{
  "success": true,
  "data": {
    "id": "out_xyz789",
    "serviceName": "AWS",
    "state": "confirmed",
    "severity": "major",
    "title": "AWS S3 Outage - US East",
    "timeline": {
      "events": [
        {
          "id": "evt_001",
          "source": "user_reports",
          "detail": "Initial reports of S3 errors",
          "confidence": 0.7,
          "occurredAt": "2026-03-20T10:30:00Z"
        }
      ],
      "firstDetectedAt": "2026-03-20T10:30:00Z",
      "confirmedAt": "2026-03-20T10:45:00Z"
    }
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/reports',
    description: 'Submit a user report for a service',
    auth: true,
    request: `POST /api/v1/reports
Content-Type: application/json
Authorization: Bearer <api_key>

{
  "serviceSlug": "aws",
  "type": "outage",
  "description": "S3 returning 503 errors in us-east-1"
}`,
    response: `{
  "success": true,
  "data": {
    "id": "rpt_def456",
    "submittedAt": "2026-03-20T11:00:00Z"
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/stats',
    description: 'Get platform summary statistics',
    auth: false,
    request: 'GET /api/v1/stats',
    response: `{
  "success": true,
  "data": {
    "totalServices": 45,
    "activeOutages": 3,
    "reportsToday": 287
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/services/:slug/reports',
    description: 'Get report time series for a service',
    auth: false,
    request: 'GET /api/v1/services/aws/reports?interval=24h',
    response: `{
  "success": true,
  "data": [
    { "timestamp": "2026-03-19T00:00:00Z", "count": 12 },
    { "timestamp": "2026-03-19T01:00:00Z", "count": 8 },
    { "timestamp": "2026-03-19T02:00:00Z", "count": 15 }
  ]
}`,
  },
];

const graphqlTypes = `type Service {
  id: ID!
  name: String!
  slug: String!
  category: String!
  currentStatus: ServiceStatus!
  homepageUrl: String!
  statusPageUrl: String
  iconUrl: String
  regions: [String!]!
  isActive: Boolean!
}

enum ServiceStatus {
  OPERATIONAL
  DEGRADED
  PARTIAL_OUTAGE
  MAJOR_OUTAGE
}

type Outage {
  id: ID!
  service: Service!
  state: OutageState!
  severity: Severity!
  title: String!
  summary: String
  affectedRegions: [String!]!
  confidence: Float!
  reportCount: Int!
  startedAt: DateTime!
  resolvedAt: DateTime
  timeline: OutageTimeline!
}

enum OutageState {
  SUSPECTED
  CONFIRMED
  MONITORING
  RESOLVING
  RESOLVED
}

enum Severity {
  MINOR
  MAJOR
  CRITICAL
}

type OutageTimeline {
  events: [TimelineEvent!]!
  firstDetectedAt: DateTime!
  confirmedAt: DateTime
  resolvedAt: DateTime
}

type TimelineEvent {
  id: ID!
  source: String!
  detail: String!
  confidence: Float!
  occurredAt: DateTime!
}

type PlatformStats {
  totalServices: Int!
  activeOutages: Int!
  reportsToday: Int!
}`;

const graphqlQueries = `type Query {
  services(
    page: Int = 1
    limit: Int = 20
    category: String
    search: String
  ): ServiceConnection!

  service(slug: String!): Service

  outages(
    state: OutageState
    serviceId: ID
    page: Int = 1
    limit: Int = 10
  ): OutageConnection!

  outage(id: ID!): Outage

  stats: PlatformStats!
}

type Mutation {
  submitReport(input: ReportInput!): Report!
  createMonitor(input: MonitorInput!): Monitor!
  updateMonitor(id: ID!, input: MonitorInput!): Monitor!
  deleteMonitor(id: ID!): Boolean!
}

type Subscription {
  outageCreated: Outage!
  outageUpdated(serviceId: ID): Outage!
  outageResolved(serviceId: ID): Outage!
  serviceStatusChanged(slug: String): Service!
}

input ReportInput {
  serviceSlug: String!
  type: ReportType!
  description: String
}

enum ReportType {
  OUTAGE
  DEGRADED
  RESOLVED
}`;

const jsExample = `import { GraphQLClient, gql } from 'graphql-request';

const client = new GraphQLClient('https://api.openpulse.dev/graphql', {
  headers: {
    Authorization: \`Bearer \${process.env.OPENPULSE_API_KEY}\`,
  },
});

// Query active outages
const query = gql\`
  query ActiveOutages {
    outages(state: CONFIRMED) {
      items {
        id
        title
        severity
        service {
          name
          slug
        }
        startedAt
        reportCount
      }
    }
  }
\`;

const data = await client.request(query);
console.log(data.outages.items);

// Subscribe to outage updates
const subscription = gql\`
  subscription OnOutageUpdated {
    outageUpdated {
      id
      state
      title
      service { name }
    }
  }
\`;`;

const pyExample = `import requests

API_URL = "https://api.openpulse.dev/graphql"
API_KEY = "your_api_key_here"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# Query active outages
query = """
query ActiveOutages {
    outages(state: CONFIRMED) {
        items {
            id
            title
            severity
            service {
                name
                slug
            }
            startedAt
            reportCount
        }
    }
}
"""

response = requests.post(
    API_URL,
    json={"query": query},
    headers=headers,
)

data = response.json()
for outage in data["data"]["outages"]["items"]:
    print(f"{outage['service']['name']}: {outage['title']}")

# Submit a report
mutation = """
mutation SubmitReport($input: ReportInput!) {
    submitReport(input: $input) {
        id
        submittedAt
    }
}
"""

variables = {
    "input": {
        "serviceSlug": "aws",
        "type": "OUTAGE",
        "description": "S3 returning 503 errors",
    }
}

response = requests.post(
    API_URL,
    json={"query": mutation, "variables": variables},
    headers=headers,
)`;

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const rateLimits = [
  { tier: 'Free', requests: '100 / hour', burst: '10 / min' },
  { tier: 'Pro', requests: '1,000 / hour', burst: '50 / min' },
  { tier: 'Enterprise', requests: '10,000 / hour', burst: '500 / min' },
];

export default function ApiDocsPage() {
  const [activeTab, setActiveTab] = useState<ApiTab>('rest');
  const [expandedEndpoint, setExpandedEndpoint] = useState<number | null>(null);
  const [codeTab, setCodeTab] = useState<'js' | 'python'>('js');

  function toggleEndpoint(index: number) {
    setExpandedEndpoint(expandedEndpoint === index ? null : index);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <BookOpen className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            API Documentation
          </h1>
        </div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Complete reference for the OpenPulse REST and GraphQL APIs.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-8 border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-1">
          <button
            onClick={() => setActiveTab('rest')}
            className={cn(
              'inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'rest'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300',
            )}
          >
            <Code2 className="h-4 w-4" />
            REST API
          </button>
          <button
            onClick={() => setActiveTab('graphql')}
            className={cn(
              'inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'graphql'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300',
            )}
          >
            <Code2 className="h-4 w-4" />
            GraphQL API
          </button>
        </nav>
      </div>

      {/* REST API Tab */}
      {activeTab === 'rest' && (
        <div className="space-y-8">
          {/* Authentication Section */}
          <div className="card">
            <div className="mb-4 flex items-center gap-2">
              <Key className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                Authentication
              </h2>
            </div>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
              Most read endpoints are public. Write operations require an API key passed in the
              Authorization header.
            </p>
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
              <code className="text-sm text-gray-800 dark:text-gray-200">
                Authorization: Bearer op_live_xxxxxxxxxxxxxxxxxxxx
              </code>
            </div>
            <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p>1. Navigate to Settings and click "Create API Key"</p>
              <p>2. Give your key a descriptive name and select permissions</p>
              <p>3. Copy and store the key securely -- it will only be shown once</p>
            </div>
          </div>

          {/* Endpoints */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
              Endpoints
            </h2>
            <div className="space-y-3">
              {restEndpoints.map((endpoint, i) => (
                <div key={i} className="card overflow-hidden !p-0">
                  <button
                    type="button"
                    onClick={() => toggleEndpoint(i)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <span
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-bold uppercase',
                        methodColors[endpoint.method],
                      )}
                    >
                      {endpoint.method}
                    </span>
                    <code className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {endpoint.path}
                    </code>
                    <span className="hidden text-sm text-gray-500 dark:text-gray-400 sm:block">
                      {endpoint.description}
                    </span>
                    {endpoint.auth ? (
                      <Lock className="h-4 w-4 shrink-0 text-yellow-500" aria-label="Auth required" />
                    ) : (
                      <Unlock className="h-4 w-4 shrink-0 text-green-500" aria-label="Public" />
                    )}
                    {expandedEndpoint === i ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                    )}
                  </button>

                  {expandedEndpoint === i && (
                    <div className="border-t border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-700 dark:bg-gray-800/30">
                      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400 sm:hidden">
                        {endpoint.description}
                      </p>
                      <div className="mb-4">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Request
                        </h4>
                        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
                          <code>{endpoint.request}</code>
                        </pre>
                      </div>
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Response
                        </h4>
                        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
                          <code>{endpoint.response}</code>
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Rate Limiting */}
          <div className="card">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                Rate Limiting
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Tier</th>
                    <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Requests</th>
                    <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">Burst</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {rateLimits.map((rl) => (
                    <tr key={rl.tier}>
                      <td className="py-3 pr-4 font-medium text-gray-900 dark:text-gray-100">{rl.tier}</td>
                      <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">{rl.requests}</td>
                      <td className="py-3 text-gray-600 dark:text-gray-400">{rl.burst}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Rate limit headers are included in every response:
              X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
            </p>
          </div>
        </div>
      )}

      {/* GraphQL API Tab */}
      {activeTab === 'graphql' && (
        <div className="space-y-8">
          {/* Schema Explorer */}
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
              Schema Types
            </h2>
            <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
              <code>{graphqlTypes}</code>
            </pre>
          </div>

          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
              Queries, Mutations & Subscriptions
            </h2>
            <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
              <code>{graphqlQueries}</code>
            </pre>
          </div>

          {/* Code Examples */}
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
              Code Examples
            </h2>
            <div className="mb-4 flex gap-1">
              <button
                onClick={() => setCodeTab('js')}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  codeTab === 'js'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
                )}
              >
                JavaScript
              </button>
              <button
                onClick={() => setCodeTab('python')}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  codeTab === 'python'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
                )}
              >
                Python
              </button>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
              <code>{codeTab === 'js' ? jsExample : pyExample}</code>
            </pre>
          </div>

          {/* GraphQL Endpoint */}
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
              GraphQL Endpoint
            </h2>
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
              <code className="text-sm text-gray-800 dark:text-gray-200">
                POST https://api.openpulse.dev/graphql
              </code>
            </div>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              All GraphQL requests should be sent as POST with a JSON body containing
              the query, variables, and optional operationName fields. WebSocket
              subscriptions use the endpoint{' '}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                wss://api.openpulse.dev/graphql
              </code>
              {' '}with the graphql-ws protocol.
            </p>
          </div>

          {/* Rate Limits */}
          <div className="card">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                Rate Limiting
              </h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              GraphQL queries and mutations share the same rate limits as the REST API.
              Complex queries that resolve many nested resources may count as multiple requests
              based on query cost analysis.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Tier</th>
                    <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Requests</th>
                    <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">Burst</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {rateLimits.map((rl) => (
                    <tr key={rl.tier}>
                      <td className="py-3 pr-4 font-medium text-gray-900 dark:text-gray-100">{rl.tier}</td>
                      <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">{rl.requests}</td>
                      <td className="py-3 text-gray-600 dark:text-gray-400">{rl.burst}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
