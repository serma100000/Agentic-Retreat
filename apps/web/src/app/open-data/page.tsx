import { Database, Download, Code2, Shield, Zap, Globe } from 'lucide-react';
import QueryBuilder from '@/components/QueryBuilder';
import CodeBlock from '@/components/CodeBlock';

const sdkExamples = [
  {
    language: 'javascript',
    title: 'JavaScript',
    code: `import { OpenPulse } from '@openpulse/sdk';

const client = new OpenPulse({
  apiKey: process.env.OPENPULSE_API_KEY,
});

// Query recent outages
const outages = await client.outages.list({
  services: ['aws', 'github'],
  startDate: '2026-03-01',
  endDate: '2026-03-20',
  severity: 'major',
});

console.log(\`Found \${outages.total} outages\`);

for (const outage of outages.data) {
  console.log(\`\${outage.service}: \${outage.status} (\${outage.duration})\`);
}

// Export as CSV
const csv = await client.export({
  format: 'csv',
  dateRange: { start: '2026-01-01', end: '2026-03-20' },
});`,
  },
  {
    language: 'python',
    title: 'Python',
    code: `from openpulse import OpenPulse

client = OpenPulse(api_key="your-api-key")

# Query recent outages
outages = client.outages.list(
    services=["aws", "github"],
    start_date="2026-03-01",
    end_date="2026-03-20",
    severity="major",
)

print(f"Found {outages.total} outages")

for outage in outages.data:
    print(f"{outage.service}: {outage.status} ({outage.duration})")

# Export as CSV
csv_data = client.export(
    format="csv",
    date_range={"start": "2026-01-01", "end": "2026-03-20"},
)`,
  },
  {
    language: 'go',
    title: 'Go',
    code: `package main

import (
    "fmt"
    "github.com/openpulse/go-sdk"
)

func main() {
    client := openpulse.NewClient("your-api-key")

    // Query recent outages
    outages, err := client.Outages.List(&openpulse.ListParams{
        Services:  []string{"aws", "github"},
        StartDate: "2026-03-01",
        EndDate:   "2026-03-20",
        Severity:  "major",
    })
    if err != nil {
        panic(err)
    }

    fmt.Printf("Found %d outages\\n", outages.Total)

    for _, outage := range outages.Data {
        fmt.Printf("%s: %s (%s)\\n", outage.Service, outage.Status, outage.Duration)
    }
}`,
  },
] as const;

export default function OpenDataPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <section className="mb-16 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            <Globe className="h-4 w-4" />
            CC-BY-4.0 Licensed
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-5xl">
            Open Data for Everyone
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            All outage data collected by OpenPulse is freely available under the
            CC-BY-4.0 license. Query, download, and build upon real-time and historical
            service status data -- no strings attached.
          </p>
        </div>
      </section>

      {/* Value Props */}
      <section className="mb-16 grid gap-6 sm:grid-cols-3">
        <div className="card flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30">
            <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Structured Data
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Clean, normalized outage records with service, status, duration, confidence scores, and affected regions.
          </p>
        </div>
        <div className="card flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/30">
            <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Privacy-First
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No PII. All data is aggregated and anonymized. User reports are stripped of identifying information before storage.
          </p>
        </div>
        <div className="card flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/30">
            <Zap className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Real-Time API
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            REST and WebSocket APIs for live data. SDKs for JavaScript, Python, and Go. Webhook support for event-driven integrations.
          </p>
        </div>
      </section>

      {/* Query Builder */}
      <section className="mb-16">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Query Builder
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Build your query, preview results, and export data in JSON or CSV format.
          </p>
        </div>
        <div className="card">
          <QueryBuilder />
        </div>
      </section>

      {/* Rate Limits */}
      <section className="mb-16">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                Free Tier Rate Limits
              </h3>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                1,000 requests per day with no API key required. Need more?
                Register for a free API key to unlock 10,000 req/day, or contact us for enterprise plans.
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <a
                href="/api-docs"
                className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-600 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/70"
              >
                API Docs
              </a>
              <a
                href="/settings"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Get API Key
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* SDK Examples */}
      <section className="mb-16">
        <div className="mb-6 flex items-center gap-3">
          <Code2 className="h-6 w-6 text-gray-700 dark:text-gray-300" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
              SDKs &amp; Code Examples
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Get started in minutes with official SDKs.
            </p>
          </div>
        </div>
        <CodeBlock tabs={[...sdkExamples]} />
        <div className="mt-4 flex gap-3">
          <a
            href="https://www.npmjs.com/package/@openpulse/sdk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Download className="h-3.5 w-3.5" />
            npm install @openpulse/sdk
          </a>
          <a
            href="https://pypi.org/project/openpulse/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Download className="h-3.5 w-3.5" />
            pip install openpulse
          </a>
          <a
            href="https://pkg.go.dev/github.com/openpulse/go-sdk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Download className="h-3.5 w-3.5" />
            go get openpulse/go-sdk
          </a>
        </div>
      </section>
    </div>
  );
}
