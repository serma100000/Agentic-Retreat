/**
 * Twitter/X Filtered Stream API v2 client.
 *
 * In production, connects to the real Twitter stream endpoint.
 * In dev/mock mode, generates realistic outage-related tweets
 * with configurable probability.
 */

import type { SocialPost, TwitterStreamConfig } from './types.js';
import { Platform } from './types.js';

const DEFAULT_CONFIG: TwitterStreamConfig = {
  bearerToken: '',
  filterRules: [],
  reconnectMaxRetries: 8,
  reconnectBaseDelayMs: 1000,
  mockMode: true,
  mockOutageProbability: 0.4,
  mockIntervalMs: 3000,
};

const OUTAGE_PHRASES = [
  'is down',
  'outage',
  'not working',
  'having issues',
  "can't access",
  "won't load",
  'is broken',
  'experiencing issues',
  'having problems',
  'error',
];

const MOCK_SERVICES = [
  'Discord', 'GitHub', 'AWS', 'Slack', 'Cloudflare',
  'Spotify', 'Netflix', 'Gmail', 'Twitter', 'Steam',
];

const MOCK_OUTAGE_TEMPLATES = [
  '{service} is down again! This is ridiculous.',
  'Is {service} not working for anyone else?? I keep getting errors',
  '{service} outage affecting my entire team right now',
  'WHY IS {service} DOWN AGAIN?! Third time this week!',
  'Getting 503 errors on {service}. Anyone else?',
  "{service} won't load. Just me or is it down?",
  "Can't access {service} - timeout errors everywhere",
  'RIP {service} servers lol',
  'Scheduled maintenance for {service} tonight at 10pm UTC',
  '{service} having issues? My dashboard shows errors',
  'Anyone else getting 500 Internal Server Error on {service}?',
  '{service} is super slow today, pages taking 30+ seconds',
  'F in chat for {service} users right now',
  'Just me or is {service} login broken?',
  '{service} status page says all systems operational but nothing works lmao',
];

const MOCK_NORMAL_TEMPLATES = [
  'Just deployed my new app on {service}, works great!',
  'Love the new {service} update, so smooth',
  'Learning how to use {service} API, pretty cool stuff',
  '{service} has great documentation honestly',
  'Migrating from {service} to a new provider next month',
  'Anyone have good {service} tutorials to recommend?',
];

export class TwitterClient {
  private config: TwitterStreamConfig;
  private connected: boolean;
  private abortController: AbortController | null;
  private reconnectAttempt: number;

  constructor(config: Partial<TwitterStreamConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.connected = false;
    this.abortController = null;
    this.reconnectAttempt = 0;
  }

  /**
   * Build filter rules from service names combined with outage phrases.
   * Each rule matches a service name co-occurring with an outage indicator.
   */
  buildFilterRules(serviceNames: string[]): string[] {
    const rules: string[] = [];
    for (const service of serviceNames) {
      const phraseGroup = OUTAGE_PHRASES.map((p) => `"${p}"`).join(' OR ');
      rules.push(`(${service}) (${phraseGroup})`);
    }
    return rules;
  }

  /**
   * Connect to Twitter Filtered Stream and yield posts as they arrive.
   * In mock mode, generates synthetic tweets at a configured interval.
   */
  async *connect(filterRules: string[]): AsyncGenerator<SocialPost> {
    this.config.filterRules = filterRules;
    this.abortController = new AbortController();
    this.connected = true;
    this.reconnectAttempt = 0;

    try {
      if (this.config.mockMode) {
        yield* this.mockStream();
      } else {
        yield* this.realStream();
      }
    } finally {
      this.connected = false;
    }
  }

  /**
   * Disconnect from the stream.
   */
  disconnect(): void {
    this.connected = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async *mockStream(): AsyncGenerator<SocialPost> {
    let counter = 0;

    while (this.connected) {
      await this.delay(this.config.mockIntervalMs);
      if (!this.connected) break;

      const isOutage = Math.random() < this.config.mockOutageProbability;
      const templates = isOutage ? MOCK_OUTAGE_TEMPLATES : MOCK_NORMAL_TEMPLATES;
      const template = templates[Math.floor(Math.random() * templates.length)]!;
      const service = MOCK_SERVICES[Math.floor(Math.random() * MOCK_SERVICES.length)]!;
      const content = template.replace(/\{service\}/g, service);

      counter++;
      const authorHash = this.hashString(`mock_user_${Math.floor(Math.random() * 10000)}`);

      yield {
        id: `tw_mock_${Date.now()}_${counter}`,
        platform: Platform.TWITTER,
        content,
        authorHash,
        publishedAt: new Date(),
        url: `https://twitter.com/user/status/${Date.now()}${counter}`,
        metadata: {
          mockGenerated: true,
          isOutageRelated: isOutage,
          likeCount: Math.floor(Math.random() * 500),
          retweetCount: Math.floor(Math.random() * 100),
          replyCount: Math.floor(Math.random() * 50),
        },
      };
    }
  }

  private async *realStream(): AsyncGenerator<SocialPost> {
    while (this.connected && this.reconnectAttempt < this.config.reconnectMaxRetries) {
      try {
        const response = await fetch(
          'https://api.twitter.com/2/tweets/search/stream?tweet.fields=created_at,author_id,geo&expansions=author_id',
          {
            headers: {
              Authorization: `Bearer ${this.config.bearerToken}`,
            },
            signal: this.abortController?.signal,
          },
        );

        if (response.status === 429) {
          const resetAfter = parseInt(response.headers.get('x-rate-limit-reset') ?? '60', 10);
          const waitMs = (resetAfter - Math.floor(Date.now() / 1000)) * 1000;
          await this.delay(Math.max(waitMs, 1000));
          continue;
        }

        if (!response.ok) {
          throw new Error(`Twitter API error: ${response.status} ${response.statusText}`);
        }

        this.reconnectAttempt = 0;
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body reader');

        const decoder = new TextDecoder();
        let buffer = '';

        while (this.connected) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\r\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line) as {
                data?: { id: string; text: string; author_id: string; created_at: string };
              };
              if (data.data) {
                yield {
                  id: `tw_${data.data.id}`,
                  platform: Platform.TWITTER,
                  content: data.data.text,
                  authorHash: this.hashString(data.data.author_id),
                  publishedAt: new Date(data.data.created_at),
                  url: `https://twitter.com/i/status/${data.data.id}`,
                  metadata: { raw: data },
                };
              }
            } catch {
              // Skip malformed JSON lines (heartbeats, etc.)
            }
          }
        }
      } catch (error) {
        if (!this.connected) break;
        this.reconnectAttempt++;
        const backoffMs = this.calculateBackoff(this.reconnectAttempt);
        await this.delay(backoffMs);
      }
    }
  }

  private calculateBackoff(attempt: number): number {
    const baseDelay = this.config.reconnectBaseDelayMs;
    const maxDelay = 60_000;
    const jitter = Math.random() * 1000;
    return Math.min(baseDelay * Math.pow(2, attempt) + jitter, maxDelay);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      if (this.abortController) {
        this.abortController.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      }
    });
  }

  private hashString(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(36);
  }
}
