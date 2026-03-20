# Bounded Context: Social Intelligence

## Purpose

The Social Intelligence context monitors social media platforms for outage-related
signals. It ingests posts from Twitter/X, Reddit, Mastodon, and Bluesky, processes
them through an NLP pipeline (entity extraction, sentiment classification, geographic
extraction, urgency scoring, deduplication), and publishes structured outage mention
events consumed by the Detection Engine.

---

## Aggregate: SocialStream

The SocialStream aggregate manages the ingestion pipeline for a specific social
media platform, including connection state, filtering rules, and throughput metrics.

```
+---------------------------------------------------------------+
|  <<Aggregate Root>>  SocialStream                             |
|---------------------------------------------------------------|
|  id: StreamId                                                 |
|  platform: Platform                                           |
|  status: StreamStatus (ACTIVE | PAUSED | ERROR)               |
|  filters: List<KeywordFilter>                                 |
|  throughput: PostsPerMinute                                   |
|  lastProcessedAt: Timestamp                                   |
|---------------------------------------------------------------|
|  start() -> void                                              |
|  pause() -> void                                              |
|  updateFilters(keywords) -> void                              |
|  ingest(rawPost) -> SocialPost                                |
+---------------------------------------------------------------+
```

## Aggregate: OutageMention

The OutageMention aggregate represents a processed social media post that has been
identified as referencing a monitored service in an outage-related context.

```
+---------------------------------------------------------------+
|  <<Aggregate Root>>  OutageMention                            |
|---------------------------------------------------------------|
|  id: MentionId                                                |
|  serviceId: ServiceId                                         |
|  platform: Platform                                           |
|  sentiment: Sentiment                                         |
|  urgencyScore: UrgencyScore                                   |
|  entities: List<EntityExtraction>                             |
|  geoLocation: GeoCoordinates | null                           |
|  deduplicationCluster: ClusterId | null                       |
|  sourcePost: SocialPost                                       |
|  processedAt: Timestamp                                       |
|---------------------------------------------------------------|
|  classify(nlpResult) -> void                                  |
|  assignToCluster(clusterId) -> void                           |
|  isIndependentSignal() -> bool                                |
+---------------------------------------------------------------+
         |                            |
         v                            v
+---------------------+    +------------------------+
| SocialPost          |    | EntityExtraction       |
|---------------------|    |------------------------|
| id: PostId          |    | serviceName: string    |
| platform: Platform  |    | errorCode: string|null |
| content: string     |    | symptoms: List<string> |
| author: AuthorHash  |    | confidence: float      |
| publishedAt:        |    +------------------------+
|   Timestamp         |
| url: string         |
+---------------------+

+---------------------+
| SentimentResult     |
|---------------------|
| category: Sentiment |
| confidence: float   |
| languageIntensity:  |
|   float             |
+---------------------+
```

### Entities

| Entity | Description |
|--------|-------------|
| **SocialStream** | Aggregate root. Manages a platform-specific ingestion pipeline. |
| **OutageMention** | Aggregate root. A processed, classified social media post linked to a monitored service. |
| **SocialPost** | The raw social media post with metadata (platform, author hash, timestamp, URL). |
| **SentimentResult** | Output of the sentiment classification model for a single post. |
| **EntityExtraction** | Named entities extracted from a post (service names, error codes, symptoms). |

### Value Objects

| Value Object | Description |
|--------------|-------------|
| **Sentiment** | Enum: `OUTAGE_COMPLAINT`, `QUESTION`, `HUMOR_MEME`, `UNRELATED`. Classification of post intent. |
| **Platform** | Enum: `TWITTER`, `REDDIT`, `MASTODON`, `BLUESKY`. Source social media platform. |
| **UrgencyScore** | Float 0.0-1.0. Estimated outage severity from language intensity and specificity. |
| **ClusterId** | Identifier for a deduplication cluster of semantically similar posts. |
| **AuthorHash** | One-way hash of post author identity. No PII stored. |

---

## Domain Events

| Event | Payload | Trigger |
|-------|---------|---------|
| **OutageMentionDetected** | mentionId, serviceId, platform, sentiment, urgencyScore | NLP pipeline identifies an outage-related post |
| **SentimentShiftDetected** | serviceId, previousSentiment, currentSentiment, window | Aggregate sentiment for a service shifts significantly |
| **SocialSurgeDetected** | serviceId, platform, postsPerMinute, baseline | Post rate exceeds 5x baseline for a service |

---

## NLP Pipeline

```
Raw Post Stream (from platform APIs)
        |
        v
+-------------------+
| 1. Entity         |    Identifies service names, error codes, symptoms
|    Extraction     |    using fine-tuned DistilBERT + service name dictionary
+--------+----------+
         |
         v
+-------------------+
| 2. Sentiment      |    Classifies: OUTAGE_COMPLAINT | QUESTION |
|    Classification |    HUMOR_MEME | UNRELATED
+--------+----------+    Filters out UNRELATED posts
         |
         v
+-------------------+
| 3. Geographic     |    Extracts location from post text and author profile
|    Extraction     |    Maps to GeoCoordinates when possible
+--------+----------+
         |
         v
+-------------------+
| 4. Urgency        |    Scores 0.0-1.0 based on language intensity,
|    Scoring        |    specificity of symptoms, presence of error codes
+--------+----------+
         |
         v
+-------------------+
| 5. Deduplication  |    Clusters semantically similar posts (retweets,
|                   |    paraphrases) to avoid counting as independent signals
+--------+----------+
         |
         v
  OutageMentionDetected event
  Published to Kafka: "social.mentions"
```

The model processes posts in batches of 64 with sub-100ms inference on a single GPU.
This enables near-real-time social signal integration with the Detection Engine.

---

## Anti-Corruption Layer

External social media APIs have unstable schemas, rate limits, and authentication
requirements. Each platform adapter translates the external model:

```
Twitter API v2 -----> TwitterAdapter ----+
                                         |
Reddit API ---------> RedditAdapter -----+---> SocialPost (internal model)
                                         |
Mastodon API -------> MastodonAdapter ---+
                                         |
Bluesky AT Proto ---> BlueskyAdapter ----+
```

Each adapter handles:
- Authentication and token refresh for the platform
- Rate limit compliance and backoff
- Schema translation to the internal SocialPost model
- Error handling and reconnection logic

---

## Integration Points

| Direction | Context | Mechanism | Data |
|-----------|---------|-----------|------|
| **Upstream** | External Social APIs | Platform adapters (ACL) | Raw social posts |
| **Downstream** | Detection Engine | Kafka topic `social.mentions` | Classified outage mentions |
| **Reference** | Service Catalog | Cached lookup | Service names for entity matching |

---

## Invariants

1. Author identity MUST be hashed before storage; no PII is persisted.
2. Posts classified as UNRELATED MUST be discarded, not published downstream.
3. Deduplicated posts within the same cluster MUST count as a single signal.
4. Each platform adapter MUST respect the platform's rate limits.
5. The NLP pipeline MUST complete within 200ms per batch of 64 posts.
6. Social surge detection MUST use a rolling baseline, not a static threshold.
