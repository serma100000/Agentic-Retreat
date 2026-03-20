/**
 * Orchestrates the full social intelligence pipeline.
 *
 * Connects social media sources (Twitter, Reddit) and processes
 * posts through cleaning, entity extraction, sentiment classification,
 * urgency scoring, and deduplication. Emits typed events for
 * downstream consumers.
 */

import { EventEmitter } from 'node:events';
import { TwitterClient } from './twitter-client.js';
import { RedditClient } from './reddit-client.js';
import { TextPreprocessor } from './text-preprocessor.js';
import { EntityExtractor } from './entity-extractor.js';
import { SentimentClassifier } from './sentiment-classifier.js';
import { SignalAggregator } from './signal-aggregator.js';
import type {
  SocialPost,
  OutageMention,
  SocialSignalAggregate,
} from './types.js';
import { Sentiment } from './types.js';

/**
 * LRU cache entry with TTL.
 */
interface CacheEntry {
  cluster: string;
  insertedAt: number;
}

/**
 * Events emitted by the pipeline.
 */
export interface SocialPipelineEvents {
  mention_detected: (mention: OutageMention) => void;
  surge_detected: (serviceId: string, multiplier: number) => void;
  sentiment_shift: (serviceId: string, oldCategory: string, newCategory: string) => void;
  error: (error: Error) => void;
}

const LRU_MAX_SIZE = 10_000;
const LRU_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEDUP_SIMILARITY_THRESHOLD = 0.7;
const SURGE_CHECK_INTERVAL_MS = 30_000;

export class SocialPipeline extends EventEmitter {
  private twitterClient: TwitterClient;
  private redditClient: RedditClient;
  private preprocessor: TextPreprocessor;
  private entityExtractor: EntityExtractor;
  private sentimentClassifier: SentimentClassifier;
  private aggregator: SignalAggregator;

  private dedupCache: Map<string, CacheEntry>;
  private running: boolean;
  private surgeCheckTimer: ReturnType<typeof setInterval> | null;
  private lastDominantSentiment: Map<string, string>;
  private mentionCounter: number;

  constructor(
    twitterClient: TwitterClient,
    redditClient: RedditClient,
    preprocessor: TextPreprocessor,
    entityExtractor: EntityExtractor,
    sentimentClassifier: SentimentClassifier,
    aggregator?: SignalAggregator,
  ) {
    super();
    this.twitterClient = twitterClient;
    this.redditClient = redditClient;
    this.preprocessor = preprocessor;
    this.entityExtractor = entityExtractor;
    this.sentimentClassifier = sentimentClassifier;
    this.aggregator = aggregator ?? new SignalAggregator();
    this.dedupCache = new Map();
    this.running = false;
    this.surgeCheckTimer = null;
    this.lastDominantSentiment = new Map();
    this.mentionCounter = 0;
  }

  /**
   * Process a single social post through the full pipeline.
   * Returns an OutageMention if the post is relevant, or null if filtered out.
   */
  processPost(post: SocialPost): OutageMention | null {
    // Step 1: Clean text
    const cleanedText = this.preprocessor.clean(post.content);
    if (cleanedText.length < 5) return null;

    // Step 2: Language detection (filter non-English)
    const lang = this.preprocessor.detectLanguage(cleanedText);
    if (lang.language !== 'en') return null;

    // Step 3: Extract entities
    const entities = this.entityExtractor.extract(cleanedText);
    if (entities.length === 0) return null;

    // Step 4: Classify sentiment
    const sentiment = this.sentimentClassifier.classify(cleanedText, entities);

    // Step 5: Score urgency
    const urgencyScore = this.sentimentClassifier.scoreUrgency(sentiment, entities);

    // Step 6: Deduplication check
    const dedupCluster = this.checkDedup(cleanedText);
    if (dedupCluster === null) return null; // Duplicate, skip

    // Step 7: Build outage mention
    this.mentionCounter++;
    const mention: OutageMention = {
      id: `om_${Date.now()}_${this.mentionCounter}`,
      serviceId: entities[0]!.serviceSlug,
      platform: post.platform,
      sentiment,
      urgencyScore,
      entities,
      geoLocation: this.extractGeoLocation(post),
      deduplicationCluster: dedupCluster,
      sourcePost: post,
      processedAt: new Date(),
    };

    // Step 8: Record in aggregator
    this.aggregator.recordMention(mention.serviceId, mention);

    return mention;
  }

  /**
   * Start the full pipeline: connect to sources, process posts,
   * and begin surge detection.
   */
  async startPipeline(serviceNames: string[]): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Build Twitter filter rules
    const filterRules = this.twitterClient.buildFilterRules(serviceNames);

    // Start surge detection check loop
    this.surgeCheckTimer = setInterval(() => {
      this.checkForSurges();
    }, SURGE_CHECK_INTERVAL_MS);

    // Process Twitter stream
    const twitterPromise = (async () => {
      try {
        for await (const post of this.twitterClient.connect(filterRules)) {
          if (!this.running) break;
          try {
            const mention = this.processPost(post);
            if (mention) {
              this.emit('mention_detected', mention);
            }
          } catch (err) {
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
          }
        }
      } catch (err) {
        if (this.running) {
          this.emit('error', err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    // Process Reddit poller
    const redditPromise = (async () => {
      try {
        for await (const post of this.redditClient.pollSubreddits()) {
          if (!this.running) break;
          try {
            const mention = this.processPost(post);
            if (mention) {
              this.emit('mention_detected', mention);
            }
          } catch (err) {
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
          }
        }
      } catch (err) {
        if (this.running) {
          this.emit('error', err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    // Run both streams concurrently (don't await — they run until stopped)
    void twitterPromise;
    void redditPromise;
  }

  /**
   * Get signal aggregates for a specific service.
   */
  getSignalAggregates(serviceId: string, windowMinutes?: number): SocialSignalAggregate {
    return this.aggregator.getAggregates(serviceId, windowMinutes);
  }

  /**
   * Get the underlying aggregator (for direct access in tests).
   */
  getAggregator(): SignalAggregator {
    return this.aggregator;
  }

  /**
   * Stop all pipeline processing.
   */
  stopPipeline(): void {
    this.running = false;
    this.twitterClient.disconnect();
    this.redditClient.stop();
    if (this.surgeCheckTimer) {
      clearInterval(this.surgeCheckTimer);
      this.surgeCheckTimer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Check deduplication. Returns a cluster ID if the post is new,
   * or null if it is a near-duplicate of an existing post.
   */
  private checkDedup(text: string): string | null {
    this.pruneDedupCache();

    const signature = this.preprocessor.generateMinHash(text);
    const signatureKey = signature.slice(0, 16).join(',');

    // Check against existing entries for near-duplicates
    for (const [existingText, entry] of this.dedupCache.entries()) {
      if (this.preprocessor.isNearDuplicate(text, existingText, DEDUP_SIMILARITY_THRESHOLD)) {
        return null; // Duplicate found
      }
      void entry; // used for iteration
    }

    // New unique post — add to cache
    const cluster = `cluster_${Date.now()}_${signatureKey.slice(0, 20)}`;
    this.dedupCache.set(text, { cluster, insertedAt: Date.now() });

    // Enforce LRU size limit
    if (this.dedupCache.size > LRU_MAX_SIZE) {
      const firstKey = this.dedupCache.keys().next().value;
      if (firstKey !== undefined) {
        this.dedupCache.delete(firstKey);
      }
    }

    return cluster;
  }

  private pruneDedupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.dedupCache.entries()) {
      if (now - entry.insertedAt > LRU_TTL_MS) {
        this.dedupCache.delete(key);
      }
    }
  }

  private checkForSurges(): void {
    for (const serviceId of this.aggregator.getTrackedServices()) {
      // Check surge
      if (this.aggregator.isSurge(serviceId)) {
        const multiplier = this.aggregator.getSurgeMultiplier(serviceId);
        this.emit('surge_detected', serviceId, multiplier);
      }

      // Check sentiment shifts
      const aggregates = this.aggregator.getAggregates(serviceId);
      const breakdown = aggregates.sentimentBreakdown;
      let dominant = Sentiment.UNRELATED as string;
      let maxCount = 0;
      for (const [category, count] of Object.entries(breakdown)) {
        if (count > maxCount) {
          maxCount = count;
          dominant = category;
        }
      }

      const previousDominant = this.lastDominantSentiment.get(serviceId);
      if (previousDominant && previousDominant !== dominant && maxCount > 0) {
        this.emit('sentiment_shift', serviceId, previousDominant, dominant);
      }
      if (maxCount > 0) {
        this.lastDominantSentiment.set(serviceId, dominant);
      }
    }
  }

  private extractGeoLocation(post: SocialPost): string | null {
    const geo = post.metadata['geo'];
    if (typeof geo === 'string') return geo;
    if (geo && typeof geo === 'object' && 'place' in (geo as Record<string, unknown>)) {
      return String((geo as Record<string, unknown>)['place']);
    }
    return null;
  }
}
