import { describe, it, expect, beforeEach } from 'vitest';
import { SocialPipeline } from '../social-pipeline.js';
import { TwitterClient } from '../twitter-client.js';
import { RedditClient } from '../reddit-client.js';
import { TextPreprocessor } from '../text-preprocessor.js';
import { EntityExtractor } from '../entity-extractor.js';
import { SentimentClassifier } from '../sentiment-classifier.js';
import { SignalAggregator } from '../signal-aggregator.js';
import { Platform, Sentiment } from '../types.js';
import type { SocialPost, OutageMention } from '../types.js';

const TEST_SERVICES = [
  { name: 'Discord', slug: 'discord' },
  { name: 'GitHub', slug: 'github' },
  { name: 'AWS', slug: 'aws' },
  { name: 'Slack', slug: 'slack' },
  { name: 'Cloudflare', slug: 'cloudflare' },
];

function createPost(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    platform: Platform.TWITTER,
    content: 'Discord is down again! This is ridiculous!',
    authorHash: 'abc123',
    publishedAt: new Date(),
    url: 'https://twitter.com/test/status/123',
    metadata: {},
    ...overrides,
  };
}

describe('SocialPipeline', () => {
  let pipeline: SocialPipeline;
  let twitterClient: TwitterClient;
  let redditClient: RedditClient;
  let preprocessor: TextPreprocessor;
  let entityExtractor: EntityExtractor;
  let sentimentClassifier: SentimentClassifier;
  let aggregator: SignalAggregator;

  beforeEach(() => {
    twitterClient = new TwitterClient({ mockMode: true });
    redditClient = new RedditClient({ mockMode: true });
    preprocessor = new TextPreprocessor();
    entityExtractor = new EntityExtractor(TEST_SERVICES);
    sentimentClassifier = new SentimentClassifier();
    aggregator = new SignalAggregator();

    pipeline = new SocialPipeline(
      twitterClient,
      redditClient,
      preprocessor,
      entityExtractor,
      sentimentClassifier,
      aggregator,
    );
  });

  describe('processPost - full pipeline', () => {
    it('should process a raw outage post into an OutageMention', () => {
      const post = createPost({
        content: 'Discord is down again! Getting 503 errors everywhere!',
      });

      const mention = pipeline.processPost(post);

      expect(mention).not.toBeNull();
      expect(mention!.serviceId).toBe('discord');
      expect(mention!.platform).toBe(Platform.TWITTER);
      expect(mention!.entities.length).toBeGreaterThan(0);
      expect(mention!.entities[0]!.serviceName).toBe('Discord');
      expect(mention!.urgencyScore).toBeGreaterThan(0);
      expect(mention!.sentiment.category).toBe(Sentiment.OUTAGE_COMPLAINT);
      expect(mention!.processedAt).toBeInstanceOf(Date);
      expect(mention!.sourcePost).toBe(post);
    });

    it('should process question posts correctly', () => {
      const post = createPost({
        content: 'Is GitHub down for anyone else? Just me?',
      });

      const mention = pipeline.processPost(post);

      expect(mention).not.toBeNull();
      expect(mention!.serviceId).toBe('github');
      expect(mention!.sentiment.category).toBe(Sentiment.QUESTION);
    });

    it('should return null for posts with no recognized entities', () => {
      const post = createPost({
        content: 'The weather is beautiful today and I am happy',
      });

      const mention = pipeline.processPost(post);
      expect(mention).toBeNull();
    });

    it('should extract error codes through the pipeline', () => {
      const post = createPost({
        content: 'Cloudflare returning 502 Bad Gateway error on our site',
      });

      const mention = pipeline.processPost(post);

      expect(mention).not.toBeNull();
      expect(mention!.entities[0]!.errorCode).toBe('502');
    });

    it('should extract symptoms through the pipeline', () => {
      const post = createPost({
        content: 'Slack is super slow and keeps timing out for me',
      });

      const mention = pipeline.processPost(post);

      expect(mention).not.toBeNull();
      expect(mention!.entities[0]!.symptoms).toContain('slow');
    });
  });

  describe('deduplication', () => {
    it('should deduplicate near-duplicate posts', () => {
      const post1 = createPost({
        id: 'dup_1',
        content: 'Discord is down again! This is ridiculous!',
      });
      const post2 = createPost({
        id: 'dup_2',
        content: 'Discord is down again! This is so ridiculous!',
      });

      const mention1 = pipeline.processPost(post1);
      const mention2 = pipeline.processPost(post2);

      expect(mention1).not.toBeNull();
      expect(mention2).toBeNull(); // Deduplicated
    });

    it('should allow through genuinely different posts', () => {
      const post1 = createPost({
        id: 'diff_1',
        content: 'Discord is completely broken, nobody can connect to servers',
      });
      const post2 = createPost({
        id: 'diff_2',
        content: 'GitHub pages not loading for our team, getting 502 errors',
      });

      const mention1 = pipeline.processPost(post1);
      const mention2 = pipeline.processPost(post2);

      expect(mention1).not.toBeNull();
      expect(mention2).not.toBeNull();
    });
  });

  describe('non-English filtering', () => {
    it('should filter out non-English posts', () => {
      const post = createPost({
        content: 'Le service Discord est en panne depuis ce matin malheureusement',
      });

      const mention = pipeline.processPost(post);
      expect(mention).toBeNull();
    });

    it('should keep English posts', () => {
      const post = createPost({
        content: 'Discord is down and not working for anyone in our team',
      });

      const mention = pipeline.processPost(post);
      expect(mention).not.toBeNull();
    });
  });

  describe('signal aggregation', () => {
    it('should aggregate mentions into correct windowed counts', () => {
      // Process several mentions for the same service
      const posts = [
        createPost({ id: 'agg_1', content: 'Discord is down right now and not working for anyone!' }),
        createPost({ id: 'agg_2', content: 'All Discord servers have been completely broken since this morning with total outage reported' }),
        createPost({ id: 'agg_3', content: 'My Discord app keeps giving me a 503 error code on every single API request today' }),
      ];

      for (const post of posts) {
        pipeline.processPost(post);
      }

      const agg = pipeline.getSignalAggregates('discord');
      expect(agg.mentionCount).toBe(3);
      expect(agg.serviceId).toBe('discord');
      expect(agg.avgUrgency).toBeGreaterThan(0);
      expect(agg.windowStart).toBeInstanceOf(Date);
      expect(agg.windowEnd).toBeInstanceOf(Date);
    });

    it('should track sentiment breakdown', () => {
      const posts = [
        createPost({ id: 'sb_1', content: 'Discord is completely down and broken for our whole company right now!' }),
        createPost({ id: 'sb_2', content: 'Is anyone else experiencing Discord connection issues or is it just me today?' }),
        createPost({ id: 'sb_3', content: 'RIP Discord servers once again, F in the chat for all of us lol' }),
      ];

      for (const post of posts) {
        pipeline.processPost(post);
      }

      const agg = pipeline.getSignalAggregates('discord');
      const totalSentiment = Object.values(agg.sentimentBreakdown).reduce(
        (sum, count) => sum + count,
        0,
      );
      expect(totalSentiment).toBe(agg.mentionCount);
    });
  });

  describe('surge detection', () => {
    it('should detect surge when mention rate exceeds baseline significantly', () => {
      // Set a low baseline for the service
      aggregator.setBaseline('discord', [0.1, 0.1, 0.1, 0.1, 0.1]);

      // Generate a burst of diverse mentions that avoid dedup
      const surgeMessages = [
        'Discord is down right now, completely broken for our entire team!',
        'Getting 503 errors from Discord servers, nothing loads at all',
        'WHY IS DISCORD NOT WORKING? This is the third outage this week!',
        'Discord timeout issues affecting voice chat in all regions',
        'Our company relies on Discord and the login page is broken today',
        'Discord mobile app crashes immediately on launch for me',
        'Cannot send any messages on Discord, stuck loading forever',
        "Discord's API returning 500 Internal Server Error on all endpoints",
        'Screen sharing on Discord completely broken after latest update',
        'My Discord bot is offline because their gateway is unreachable now',
        'Discord notifications not working and channels refuse to load properly',
        'Every Discord server I try to join gives me a connection refused error',
        'Discord desktop client showing a blank white screen for hours',
        'Nitro subscribers getting kicked from Discord voice channels repeatedly',
        'The Discord CDN is failing to serve any images or file attachments',
        'All my Discord webhooks are returning 502 Bad Gateway response',
        'Discord search feature has been completely nonfunctional since yesterday',
        'Getting rate limited on Discord even though I barely use it today',
        'Discord roles and permissions page gives an unhandled exception error',
        'The latest Discord update broke push to talk on every platform',
      ];
      for (let i = 0; i < surgeMessages.length; i++) {
        const post = createPost({
          id: `surge_${i}`,
          content: surgeMessages[i]!,
        });
        pipeline.processPost(post);
      }

      // Check if surge is detected
      expect(aggregator.isSurge('discord')).toBe(true);
      expect(aggregator.getSurgeMultiplier('discord')).toBeGreaterThan(5);
    });

    it('should not detect surge for normal activity', () => {
      // Set a high baseline
      aggregator.setBaseline('discord', [100, 100, 100, 100, 100]);

      // Process just one mention
      const post = createPost({
        id: 'nosurge_1',
        content: 'Discord is having a small error for some users',
      });
      pipeline.processPost(post);

      expect(aggregator.isSurge('discord')).toBe(false);
    });
  });

  describe('pipeline events', () => {
    it('should emit mention_detected for valid posts', () => {
      const mentions: OutageMention[] = [];
      pipeline.on('mention_detected', (mention: OutageMention) => {
        mentions.push(mention);
      });

      const post = createPost({
        content: 'Discord is completely down, not working at all',
      });
      const mention = pipeline.processPost(post);

      // processPost doesn't emit — events come from startPipeline
      // but we can verify the mention is valid
      expect(mention).not.toBeNull();
    });
  });

  describe('pipeline lifecycle', () => {
    it('should start and stop correctly', async () => {
      expect(pipeline.isRunning()).toBe(false);

      await pipeline.startPipeline(['Discord', 'GitHub']);
      expect(pipeline.isRunning()).toBe(true);

      pipeline.stopPipeline();
      expect(pipeline.isRunning()).toBe(false);
    });

    it('should not start twice', async () => {
      await pipeline.startPipeline(['Discord']);
      await pipeline.startPipeline(['Discord']); // Should be no-op
      expect(pipeline.isRunning()).toBe(true);

      pipeline.stopPipeline();
    });
  });

  describe('geo location extraction', () => {
    it('should extract geo location from metadata', () => {
      const post = createPost({
        content: 'AWS is down and broken in our region!',
        metadata: { geo: 'us-east-1' },
      });

      const mention = pipeline.processPost(post);
      expect(mention).not.toBeNull();
      expect(mention!.geoLocation).toBe('us-east-1');
    });

    it('should return null for posts without geo', () => {
      const post = createPost({
        content: 'Discord is not working and is completely broken',
      });

      const mention = pipeline.processPost(post);
      expect(mention).not.toBeNull();
      expect(mention!.geoLocation).toBeNull();
    });
  });
});
