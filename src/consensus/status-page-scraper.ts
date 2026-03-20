/**
 * Status page aggregation and scraping.
 *
 * Fetches and normalizes status information from Atlassian Statuspage,
 * generic JSON/RSS/HTML endpoints, and provides polling capability.
 */

import type { StatusPageUpdate } from './types.js';
import { OutageState } from './types.js';

/** Mapping from Atlassian Statuspage indicator values to OpenPulse states. */
const ATLASSIAN_STATUS_MAP: Record<string, string> = {
  none: OutageState.OPERATIONAL,
  minor: OutageState.INVESTIGATING,
  major: OutageState.DEGRADED,
  critical: OutageState.MAJOR_OUTAGE,
  maintenance: OutageState.INVESTIGATING,
};

/** Common status strings mapped to OpenPulse states. */
const GENERIC_STATUS_MAP: Record<string, string> = {
  operational: OutageState.OPERATIONAL,
  up: OutageState.OPERATIONAL,
  ok: OutageState.OPERATIONAL,
  healthy: OutageState.OPERATIONAL,
  available: OutageState.OPERATIONAL,
  degraded: OutageState.DEGRADED,
  degraded_performance: OutageState.DEGRADED,
  partial_outage: OutageState.DEGRADED,
  partial: OutageState.DEGRADED,
  major_outage: OutageState.MAJOR_OUTAGE,
  outage: OutageState.MAJOR_OUTAGE,
  down: OutageState.MAJOR_OUTAGE,
  unavailable: OutageState.MAJOR_OUTAGE,
  maintenance: OutageState.INVESTIGATING,
  investigating: OutageState.INVESTIGATING,
  identified: OutageState.INVESTIGATING,
  monitoring: OutageState.RECOVERING,
  recovering: OutageState.RECOVERING,
  resolved: OutageState.RESOLVED,
};

/** Keywords that indicate an active incident when found in RSS/HTML content. */
const INCIDENT_KEYWORDS = [
  'outage',
  'incident',
  'degraded',
  'disruption',
  'unavailable',
  'down',
  'issue',
  'problem',
  'maintenance',
  'investigating',
];

type StatusPageEventHandler = (update: StatusPageUpdate) => void;

export class StatusPageScraper {
  private readonly latestStatuses = new Map<string, StatusPageUpdate>();
  private readonly eventHandlers: StatusPageEventHandler[] = [];
  private readonly activePolls = new Map<string, ReturnType<typeof setInterval>>();
  private fetchFn: typeof globalThis.fetch;

  constructor(fetchFn?: typeof globalThis.fetch) {
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Register a handler for statuspage update events.
   */
  onStatusPageUpdate(handler: StatusPageEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Scrape an Atlassian Statuspage at the given URL.
   * Fetches {url}/api/v2/summary.json and parses the response.
   */
  async scrapeAtlassianStatuspage(url: string): Promise<StatusPageUpdate> {
    const apiUrl = url.replace(/\/+$/, '') + '/api/v2/summary.json';

    let rawData: unknown;
    try {
      const response = await this.fetchFn(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      rawData = await response.json();
    } catch (error) {
      return this.createErrorUpdate(url, 'atlassian', error);
    }

    const data = rawData as Record<string, unknown>;
    const status = data?.status as Record<string, unknown> | undefined;
    const indicator = (status?.indicator as string) ?? 'none';
    const normalizedStatus = ATLASSIAN_STATUS_MAP[indicator] ?? OutageState.INVESTIGATING;

    // Extract component-level details
    const components = (data?.components as Array<Record<string, unknown>>) ?? [];
    const componentStatuses = components.map((c) => ({
      name: c.name as string,
      status: c.status as string,
    }));

    const update: StatusPageUpdate = {
      serviceId: url,
      providerStatus: indicator,
      source: 'atlassian',
      normalizedStatus,
      rawData: { indicator, components: componentStatuses },
      scrapedAt: new Date(),
    };

    this.storeAndEmit(update);
    return update;
  }

  /**
   * Scrape a generic status page in JSON, RSS, or HTML format.
   */
  async scrapeGenericStatusPage(
    url: string,
    format: 'json' | 'rss' | 'html',
  ): Promise<StatusPageUpdate> {
    let rawData: unknown;
    let responseText: string;

    try {
      const response = await this.fetchFn(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      responseText = await response.text();
    } catch (error) {
      return this.createErrorUpdate(url, `generic-${format}`, error);
    }

    switch (format) {
      case 'json':
        return this.parseJsonStatusPage(url, responseText);
      case 'rss':
        return this.parseRssStatusPage(url, responseText);
      case 'html':
        return this.parseHtmlStatusPage(url, responseText);
    }
  }

  /**
   * Normalize arbitrary provider status strings to OpenPulse OutageState values.
   */
  normalizeStatus(providerStatus: string): string {
    const normalized = providerStatus.toLowerCase().trim().replace(/[\s-]+/g, '_');
    return GENERIC_STATUS_MAP[normalized] ?? OutageState.INVESTIGATING;
  }

  /**
   * Poll all configured status pages at the given interval.
   * Emits 'statuspage_update' events for each poll result.
   */
  pollStatusPages(
    services: Array<{ serviceId: string; statusPageUrl: string }>,
    intervalMs: number,
  ): void {
    // Stop any existing polls
    this.stopPolling();

    for (const service of services) {
      // Do an initial scrape immediately
      void this.scrapeAtlassianStatuspage(service.statusPageUrl).then((update) => {
        update.serviceId = service.serviceId;
        this.storeAndEmit(update);
      });

      // Set up interval
      const intervalId = setInterval(() => {
        void this.scrapeAtlassianStatuspage(service.statusPageUrl).then((update) => {
          update.serviceId = service.serviceId;
          this.storeAndEmit(update);
        });
      }, intervalMs);

      this.activePolls.set(service.serviceId, intervalId);
    }
  }

  /**
   * Stop all active polling.
   */
  stopPolling(): void {
    for (const intervalId of this.activePolls.values()) {
      clearInterval(intervalId);
    }
    this.activePolls.clear();
  }

  /**
   * Get the latest cached status for a service.
   */
  getLatestStatus(serviceId: string): StatusPageUpdate | null {
    return this.latestStatuses.get(serviceId) ?? null;
  }

  // ---- Private ----

  private parseJsonStatusPage(url: string, text: string): StatusPageUpdate {
    let rawData: unknown;
    try {
      rawData = JSON.parse(text);
    } catch {
      return this.createErrorUpdate(url, 'generic-json', new Error('Invalid JSON'));
    }

    const data = rawData as Record<string, unknown>;
    // Look for common status/state fields
    const providerStatus = (
      (data.status as string) ??
      (data.state as string) ??
      (data.overall_status as string) ??
      ((data.status as Record<string, unknown>)?.indicator as string) ??
      'unknown'
    );

    const normalizedStatus = this.normalizeStatus(String(providerStatus));

    const update: StatusPageUpdate = {
      serviceId: url,
      providerStatus: String(providerStatus),
      source: 'generic-json',
      normalizedStatus,
      rawData,
      scrapedAt: new Date(),
    };

    this.storeAndEmit(update);
    return update;
  }

  private parseRssStatusPage(url: string, text: string): StatusPageUpdate {
    // Extract latest entry title and description using regex
    const titleMatch = text.match(/<item[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i);
    const descMatch = text.match(/<item[^>]*>[\s\S]*?<description[^>]*>([\s\S]*?)<\/description>/i);

    const latestTitle = titleMatch?.[1]?.trim() ?? '';
    const latestDesc = descMatch?.[1]?.trim() ?? '';
    const combinedText = `${latestTitle} ${latestDesc}`.toLowerCase();

    // Check for incident keywords
    const hasIncident = INCIDENT_KEYWORDS.some((kw) => combinedText.includes(kw));
    const providerStatus = hasIncident ? 'incident' : 'operational';
    const normalizedStatus = hasIncident ? OutageState.INVESTIGATING : OutageState.OPERATIONAL;

    const update: StatusPageUpdate = {
      serviceId: url,
      providerStatus,
      source: 'generic-rss',
      normalizedStatus,
      rawData: { latestTitle, latestDesc },
      scrapedAt: new Date(),
    };

    this.storeAndEmit(update);
    return update;
  }

  private parseHtmlStatusPage(url: string, text: string): StatusPageUpdate {
    const lowerText = text.toLowerCase();

    // Look for common status indicator patterns in HTML
    const statusPatterns = [
      /class="[^"]*status[^"]*"[^>]*>([^<]+)</i,
      /data-status="([^"]+)"/i,
      /<span[^>]*class="[^"]*indicator[^"]*"[^>]*>([^<]+)</i,
      /All\s+Systems?\s+(Operational|Down|Degraded)/i,
    ];

    let providerStatus = 'unknown';
    for (const pattern of statusPatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        providerStatus = match[1].trim();
        break;
      }
    }

    // Fallback: check for incident keywords
    if (providerStatus === 'unknown') {
      const hasIncident = INCIDENT_KEYWORDS.some((kw) => lowerText.includes(kw));
      providerStatus = hasIncident ? 'incident_detected' : 'operational';
    }

    const normalizedStatus = this.normalizeStatus(providerStatus);

    const update: StatusPageUpdate = {
      serviceId: url,
      providerStatus,
      source: 'generic-html',
      normalizedStatus,
      rawData: { extractedStatus: providerStatus },
      scrapedAt: new Date(),
    };

    this.storeAndEmit(update);
    return update;
  }

  private createErrorUpdate(url: string, source: string, error: unknown): StatusPageUpdate {
    const message = error instanceof Error ? error.message : String(error);
    return {
      serviceId: url,
      providerStatus: 'error',
      source,
      normalizedStatus: OutageState.INVESTIGATING,
      rawData: { error: message },
      scrapedAt: new Date(),
    };
  }

  private storeAndEmit(update: StatusPageUpdate): void {
    this.latestStatuses.set(update.serviceId, update);
    for (const handler of this.eventHandlers) {
      handler(update);
    }
  }
}
