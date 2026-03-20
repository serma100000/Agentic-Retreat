/**
 * Reddit API client for polling subreddits for outage-related posts.
 *
 * Monitors configurable subreddits, deduplicates seen posts,
 * and respects rate limits (60 req/min). In mock mode, generates
 * realistic outage discussion posts.
 */

import type { SocialPost, RedditConfig } from './types.js';
import { Platform } from './types.js';

const DEFAULT_CONFIG: RedditConfig = {
  clientId: '',
  clientSecret: '',
  userAgent: 'OpenPulse/0.1.0',
  subreddits: ['technology', 'sysadmin', 'outages', 'netsec', 'aws', 'azure', 'google'],
  pollIntervalMs: 60_000,
  mockMode: true,
  mockIntervalMs: 5000,
};

const MOCK_SERVICES = [
  'AWS', 'Azure', 'Google Cloud', 'Cloudflare', 'GitHub',
  'Slack', 'Discord', 'Zoom', 'Datadog', 'PagerDuty',
];

const MOCK_REDDIT_OUTAGE_POSTS = [
  { title: '{service} down?', body: 'Is anyone else experiencing issues with {service}? Our monitoring just went crazy.' },
  { title: '{service} outage - {subreddit} discussion', body: 'Looks like {service} is having a major outage right now. Multiple regions affected. Anyone have more info?' },
  { title: 'PSA: {service} is experiencing degraded performance', body: 'Just got a notification that {service} is having issues. Status page still shows green but clearly something is wrong.' },
  { title: '{service} 503 errors everywhere', body: 'Getting 503 Service Unavailable from {service} APIs for the past 20 minutes. Anyone else?' },
  { title: 'Heads up: {service} maintenance tonight', body: 'Scheduled maintenance for {service} tonight 10pm-2am UTC. Plan accordingly.' },
  { title: '{service} login not working', body: "Can't log into {service} at all. Getting timeout errors. This is affecting our whole team." },
  { title: 'Is {service} slow for everyone or just us?', body: "{service} has been incredibly slow today. Pages taking 15+ seconds to load. We're in us-east-1." },
  { title: '{service} incident report for yesterday\'s outage', body: '{service} published their post-mortem. Root cause was a misconfigured load balancer during a deploy.' },
];

const MOCK_REDDIT_NORMAL_POSTS = [
  { title: 'Best practices for {service} deployment?', body: 'Looking for advice on deploying to {service}. What strategies do you use?' },
  { title: '{service} vs alternatives in 2024', body: 'Comparing {service} with competitors. What are your experiences?' },
  { title: 'New {service} features announcement', body: '{service} just announced some great new features. Thoughts?' },
];

export class RedditClient {
  private config: RedditConfig;
  private seenPostIds: Set<string>;
  private running: boolean;
  private accessToken: string | null;
  private tokenExpiresAt: number;
  private requestTimestamps: number[];
  private abortController: AbortController | null;

  constructor(config: Partial<RedditConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.seenPostIds = new Set();
    this.running = false;
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.requestTimestamps = [];
    this.abortController = null;
  }

  /**
   * Poll subreddits at a regular interval, yielding new posts.
   * Deduplicates based on post ID so each post is yielded at most once.
   */
  async *pollSubreddits(
    subreddits: string[] = this.config.subreddits,
    interval: number = this.config.pollIntervalMs,
  ): AsyncGenerator<SocialPost> {
    this.running = true;
    this.abortController = new AbortController();

    try {
      while (this.running) {
        for (const subreddit of subreddits) {
          if (!this.running) break;
          const posts = await this.fetchNewPosts(subreddit);
          for (const post of posts) {
            if (!this.seenPostIds.has(post.id)) {
              this.seenPostIds.add(post.id);
              yield post;
            }
          }
        }

        if (this.running) {
          await this.delay(interval);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Fetch new posts from a single subreddit.
   * Returns posts sorted by newest first.
   */
  async fetchNewPosts(subreddit: string, after?: string): Promise<SocialPost[]> {
    if (this.config.mockMode) {
      return this.mockFetchPosts(subreddit);
    }
    return this.realFetchPosts(subreddit, after);
  }

  /**
   * Stop polling.
   */
  stop(): void {
    this.running = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getSeenCount(): number {
    return this.seenPostIds.size;
  }

  clearSeen(): void {
    this.seenPostIds.clear();
  }

  private mockFetchPosts(subreddit: string): Promise<SocialPost[]> {
    const postCount = 1 + Math.floor(Math.random() * 3);
    const posts: SocialPost[] = [];

    for (let i = 0; i < postCount; i++) {
      const isOutage = Math.random() < 0.5;
      const templates = isOutage ? MOCK_REDDIT_OUTAGE_POSTS : MOCK_REDDIT_NORMAL_POSTS;
      const template = templates[Math.floor(Math.random() * templates.length)]!;
      const service = MOCK_SERVICES[Math.floor(Math.random() * MOCK_SERVICES.length)]!;

      const title = template.title
        .replace(/\{service\}/g, service)
        .replace(/\{subreddit\}/g, subreddit);
      const body = template.body.replace(/\{service\}/g, service);
      const content = `${title}\n\n${body}`;

      const postId = `rd_mock_${subreddit}_${Date.now()}_${i}`;
      const authorHash = this.hashString(`reddit_user_${Math.floor(Math.random() * 50000)}`);

      posts.push({
        id: postId,
        platform: Platform.REDDIT,
        content,
        authorHash,
        publishedAt: new Date(),
        url: `https://reddit.com/r/${subreddit}/comments/${postId.slice(0, 8)}`,
        metadata: {
          subreddit,
          mockGenerated: true,
          isOutageRelated: isOutage,
          score: Math.floor(Math.random() * 200),
          commentCount: Math.floor(Math.random() * 80),
          title,
        },
      });
    }

    return Promise.resolve(posts);
  }

  private async realFetchPosts(subreddit: string, after?: string): Promise<SocialPost[]> {
    await this.ensureRateLimit();
    await this.ensureAccessToken();

    const url = new URL(`https://oauth.reddit.com/r/${subreddit}/new.json`);
    url.searchParams.set('limit', '25');
    url.searchParams.set('raw_json', '1');
    if (after) {
      url.searchParams.set('after', after);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'User-Agent': this.config.userAgent,
      },
      signal: this.abortController?.signal,
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10);
      await this.delay(retryAfter * 1000);
      return this.realFetchPosts(subreddit, after);
    }

    if (!response.ok) {
      throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data: {
        children: Array<{
          data: {
            id: string;
            title: string;
            selftext: string;
            author: string;
            created_utc: number;
            permalink: string;
            subreddit: string;
            score: number;
            num_comments: number;
          };
        }>;
      };
    };

    this.recordRequest();

    return data.data.children.map((child) => {
      const post = child.data;
      const content = post.selftext
        ? `${post.title}\n\n${post.selftext}`
        : post.title;

      return {
        id: `rd_${post.id}`,
        platform: Platform.REDDIT as const,
        content,
        authorHash: this.hashString(post.author),
        publishedAt: new Date(post.created_utc * 1000),
        url: `https://reddit.com${post.permalink}`,
        metadata: {
          subreddit: post.subreddit,
          score: post.score,
          commentCount: post.num_comments,
          title: post.title,
        },
      };
    });
  }

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return;
    }

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.config.userAgent,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error(`Reddit auth failed: ${response.status}`);
    }

    const tokenData = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = tokenData.access_token;
    this.tokenExpiresAt = Date.now() + tokenData.expires_in * 1000 - 60_000;
  }

  private async ensureRateLimit(): Promise<void> {
    const now = Date.now();
    const windowMs = 60_000;
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < windowMs);

    if (this.requestTimestamps.length >= 59) {
      const oldestInWindow = this.requestTimestamps[0]!;
      const waitMs = windowMs - (now - oldestInWindow) + 100;
      await this.delay(waitMs);
    }
  }

  private recordRequest(): void {
    this.requestTimestamps.push(Date.now());
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
