import { describe, expect, it, vi } from 'vitest';
import { StatusPageScraper } from '../status-page-scraper.js';
import { OutageState } from '../types.js';

/**
 * Create a mock fetch function that returns a controlled response.
 */
function mockFetch(body: unknown, options?: { ok?: boolean; status?: number; statusText?: string }): typeof globalThis.fetch {
  const ok = options?.ok ?? true;
  const status = options?.status ?? 200;
  const statusText = options?.statusText ?? 'OK';
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText,
    json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
    text: () => Promise.resolve(bodyStr),
  }) as unknown as typeof globalThis.fetch;
}

function mockFetchError(errorMessage: string): typeof globalThis.fetch {
  return vi.fn().mockRejectedValue(new Error(errorMessage)) as unknown as typeof globalThis.fetch;
}

describe('StatusPageScraper', () => {
  describe('scrapeAtlassianStatuspage', () => {
    it('parses Atlassian Statuspage JSON correctly', async () => {
      const atlassianResponse = {
        status: { indicator: 'none', description: 'All Systems Operational' },
        components: [
          { name: 'API', status: 'operational' },
          { name: 'Dashboard', status: 'operational' },
        ],
      };

      const fetchFn = mockFetch(atlassianResponse);
      const scraper = new StatusPageScraper(fetchFn);

      const result = await scraper.scrapeAtlassianStatuspage('https://status.example.com');

      expect(fetchFn).toHaveBeenCalledWith('https://status.example.com/api/v2/summary.json');
      expect(result.providerStatus).toBe('none');
      expect(result.normalizedStatus).toBe(OutageState.OPERATIONAL);
      expect(result.source).toBe('atlassian');
    });

    it('normalizes none to OPERATIONAL', async () => {
      const fetchFn = mockFetch({
        status: { indicator: 'none' },
        components: [],
      });
      const scraper = new StatusPageScraper(fetchFn);

      const result = await scraper.scrapeAtlassianStatuspage('https://status.example.com');
      expect(result.normalizedStatus).toBe(OutageState.OPERATIONAL);
    });

    it('normalizes minor to INVESTIGATING', async () => {
      const fetchFn = mockFetch({
        status: { indicator: 'minor' },
        components: [],
      });
      const scraper = new StatusPageScraper(fetchFn);

      const result = await scraper.scrapeAtlassianStatuspage('https://status.example.com');
      expect(result.normalizedStatus).toBe(OutageState.INVESTIGATING);
    });

    it('normalizes major to DEGRADED', async () => {
      const fetchFn = mockFetch({
        status: { indicator: 'major' },
        components: [],
      });
      const scraper = new StatusPageScraper(fetchFn);

      const result = await scraper.scrapeAtlassianStatuspage('https://status.example.com');
      expect(result.normalizedStatus).toBe(OutageState.DEGRADED);
    });

    it('normalizes critical to MAJOR_OUTAGE', async () => {
      const fetchFn = mockFetch({
        status: { indicator: 'critical' },
        components: [],
      });
      const scraper = new StatusPageScraper(fetchFn);

      const result = await scraper.scrapeAtlassianStatuspage('https://status.example.com');
      expect(result.normalizedStatus).toBe(OutageState.MAJOR_OUTAGE);
    });

    it('handles malformed response gracefully', async () => {
      const fetchFn = mockFetch({ unexpected: 'data' });
      const scraper = new StatusPageScraper(fetchFn);

      const result = await scraper.scrapeAtlassianStatuspage('https://status.example.com');

      // Should not throw, should default to 'none' indicator -> OPERATIONAL
      expect(result).toBeDefined();
      expect(result.normalizedStatus).toBe(OutageState.OPERATIONAL);
    });

    it('handles network errors gracefully', async () => {
      const fetchFn = mockFetchError('Network timeout');
      const scraper = new StatusPageScraper(fetchFn);

      const result = await scraper.scrapeAtlassianStatuspage('https://status.example.com');

      expect(result).toBeDefined();
      expect(result.providerStatus).toBe('error');
      expect(result.normalizedStatus).toBe(OutageState.INVESTIGATING);
      expect((result.rawData as Record<string, unknown>).error).toBe('Network timeout');
    });

    it('handles HTTP error responses gracefully', async () => {
      const fetchFn = mockFetch('Not Found', { ok: false, status: 404, statusText: 'Not Found' });
      const scraper = new StatusPageScraper(fetchFn);

      const result = await scraper.scrapeAtlassianStatuspage('https://status.example.com');

      expect(result).toBeDefined();
      expect(result.providerStatus).toBe('error');
    });

    it('strips trailing slashes from URL', async () => {
      const fetchFn = mockFetch({ status: { indicator: 'none' }, components: [] });
      const scraper = new StatusPageScraper(fetchFn);

      await scraper.scrapeAtlassianStatuspage('https://status.example.com///');

      expect(fetchFn).toHaveBeenCalledWith('https://status.example.com/api/v2/summary.json');
    });
  });

  describe('scrapeGenericStatusPage', () => {
    it('parses JSON status page with status field', async () => {
      const fetchFn = mockFetch({ status: 'operational' });
      const scraper = new StatusPageScraper(fetchFn);

      const result = await scraper.scrapeGenericStatusPage('https://api.example.com/status', 'json');
      expect(result.normalizedStatus).toBe(OutageState.OPERATIONAL);
    });

    it('parses RSS feed and detects incidents', async () => {
      const rssFeed = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>Investigating connectivity issues</title>
              <description>We are investigating reports of degraded performance</description>
            </item>
          </channel>
        </rss>`;

      const fetchFn = mockFetch(rssFeed);
      const scraper = new StatusPageScraper(fetchFn);

      const result = await scraper.scrapeGenericStatusPage('https://status.example.com/rss', 'rss');
      expect(result.normalizedStatus).toBe(OutageState.INVESTIGATING);
    });

    it('parses RSS feed as operational when no incidents', async () => {
      const rssFeed = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>All systems normal</title>
              <description>Everything is running smoothly</description>
            </item>
          </channel>
        </rss>`;

      const fetchFn = mockFetch(rssFeed);
      const scraper = new StatusPageScraper(fetchFn);

      const result = await scraper.scrapeGenericStatusPage('https://status.example.com/rss', 'rss');
      expect(result.normalizedStatus).toBe(OutageState.OPERATIONAL);
    });

    it('handles network errors for generic pages', async () => {
      const fetchFn = mockFetchError('Connection refused');
      const scraper = new StatusPageScraper(fetchFn);

      const result = await scraper.scrapeGenericStatusPage('https://status.example.com', 'json');
      expect(result.providerStatus).toBe('error');
    });
  });

  describe('normalizeStatus', () => {
    it('normalizes common operational statuses', () => {
      const scraper = new StatusPageScraper(mockFetch({}));
      expect(scraper.normalizeStatus('operational')).toBe(OutageState.OPERATIONAL);
      expect(scraper.normalizeStatus('up')).toBe(OutageState.OPERATIONAL);
      expect(scraper.normalizeStatus('ok')).toBe(OutageState.OPERATIONAL);
      expect(scraper.normalizeStatus('healthy')).toBe(OutageState.OPERATIONAL);
    });

    it('normalizes degraded statuses', () => {
      const scraper = new StatusPageScraper(mockFetch({}));
      expect(scraper.normalizeStatus('degraded')).toBe(OutageState.DEGRADED);
      expect(scraper.normalizeStatus('degraded_performance')).toBe(OutageState.DEGRADED);
      expect(scraper.normalizeStatus('partial_outage')).toBe(OutageState.DEGRADED);
    });

    it('normalizes outage statuses', () => {
      const scraper = new StatusPageScraper(mockFetch({}));
      expect(scraper.normalizeStatus('major_outage')).toBe(OutageState.MAJOR_OUTAGE);
      expect(scraper.normalizeStatus('down')).toBe(OutageState.MAJOR_OUTAGE);
      expect(scraper.normalizeStatus('unavailable')).toBe(OutageState.MAJOR_OUTAGE);
    });

    it('handles case-insensitive and whitespace variations', () => {
      const scraper = new StatusPageScraper(mockFetch({}));
      expect(scraper.normalizeStatus('OPERATIONAL')).toBe(OutageState.OPERATIONAL);
      expect(scraper.normalizeStatus('  Down  ')).toBe(OutageState.MAJOR_OUTAGE);
      expect(scraper.normalizeStatus('Degraded Performance')).toBe(OutageState.DEGRADED);
    });

    it('returns INVESTIGATING for unknown statuses', () => {
      const scraper = new StatusPageScraper(mockFetch({}));
      expect(scraper.normalizeStatus('banana')).toBe(OutageState.INVESTIGATING);
      expect(scraper.normalizeStatus('')).toBe(OutageState.INVESTIGATING);
    });
  });

  describe('getLatestStatus', () => {
    it('returns null for unknown service', () => {
      const scraper = new StatusPageScraper(mockFetch({}));
      expect(scraper.getLatestStatus('unknown-service')).toBeNull();
    });

    it('returns latest status after scraping', async () => {
      const fetchFn = mockFetch({ status: { indicator: 'minor' }, components: [] });
      const scraper = new StatusPageScraper(fetchFn);

      await scraper.scrapeAtlassianStatuspage('https://status.example.com');

      const latest = scraper.getLatestStatus('https://status.example.com');
      expect(latest).not.toBeNull();
      expect(latest!.normalizedStatus).toBe(OutageState.INVESTIGATING);
    });
  });

  describe('event emission', () => {
    it('emits statuspage_update events on scrape', async () => {
      const fetchFn = mockFetch({ status: { indicator: 'none' }, components: [] });
      const scraper = new StatusPageScraper(fetchFn);
      const handler = vi.fn();
      scraper.onStatusPageUpdate(handler);

      await scraper.scrapeAtlassianStatuspage('https://status.example.com');

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          normalizedStatus: OutageState.OPERATIONAL,
        }),
      );
    });
  });
});
