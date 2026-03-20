/**
 * Types for the OpenPulse social intelligence context.
 *
 * Covers social media platforms, post ingestion, NLP classification,
 * sentiment analysis, entity extraction, and signal aggregation.
 */

export const Platform = {
  TWITTER: 'twitter',
  REDDIT: 'reddit',
  MASTODON: 'mastodon',
  BLUESKY: 'bluesky',
} as const;

export type PlatformType = (typeof Platform)[keyof typeof Platform];

export interface SocialPost {
  id: string;
  platform: PlatformType;
  content: string;
  authorHash: string;
  publishedAt: Date;
  url: string;
  metadata: Record<string, unknown>;
}

export const Sentiment = {
  OUTAGE_COMPLAINT: 'outage_complaint',
  QUESTION: 'question',
  HUMOR_MEME: 'humor_meme',
  UNRELATED: 'unrelated',
  SERVICE_ANNOUNCEMENT: 'service_announcement',
} as const;

export type SentimentType = (typeof Sentiment)[keyof typeof Sentiment];

export interface EntityExtraction {
  serviceName: string;
  serviceSlug: string;
  errorCode?: string;
  symptoms: string[];
  confidence: number;
}

export interface SentimentResult {
  category: SentimentType;
  confidence: number;
  languageIntensity: number;
}

export type UrgencyScore = number;

export interface OutageMention {
  id: string;
  serviceId: string;
  platform: PlatformType;
  sentiment: SentimentResult;
  urgencyScore: UrgencyScore;
  entities: EntityExtraction[];
  geoLocation: string | null;
  deduplicationCluster: string;
  sourcePost: SocialPost;
  processedAt: Date;
}

export interface SocialSignalAggregate {
  serviceId: string;
  platform: PlatformType | 'all';
  mentionCount: number;
  avgUrgency: number;
  sentimentBreakdown: Record<SentimentType, number>;
  windowStart: Date;
  windowEnd: Date;
}

export interface TwitterStreamConfig {
  bearerToken: string;
  filterRules: string[];
  reconnectMaxRetries: number;
  reconnectBaseDelayMs: number;
  mockMode: boolean;
  mockOutageProbability: number;
  mockIntervalMs: number;
}

export interface RedditConfig {
  clientId: string;
  clientSecret: string;
  userAgent: string;
  subreddits: string[];
  pollIntervalMs: number;
  mockMode: boolean;
  mockIntervalMs: number;
}

export interface NLPClassificationResult {
  sentiment: SentimentResult;
  entities: EntityExtraction[];
  urgencyScore: UrgencyScore;
  confidence: number;
}
