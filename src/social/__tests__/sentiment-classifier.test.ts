import { describe, it, expect, beforeEach } from 'vitest';
import { SentimentClassifier } from '../sentiment-classifier.js';
import { Sentiment } from '../types.js';
import type { EntityExtraction } from '../types.js';

describe('SentimentClassifier', () => {
  let classifier: SentimentClassifier;

  const makeEntity = (overrides: Partial<EntityExtraction> = {}): EntityExtraction => ({
    serviceName: 'Discord',
    serviceSlug: 'discord',
    symptoms: [],
    confidence: 0.8,
    ...overrides,
  });

  beforeEach(() => {
    classifier = new SentimentClassifier();
  });

  describe('classify', () => {
    it('should classify outage complaint: "WHY IS DISCORD DOWN AGAIN"', () => {
      const result = classifier.classify('WHY IS DISCORD DOWN AGAIN', [makeEntity()]);
      expect(result.category).toBe(Sentiment.OUTAGE_COMPLAINT);
      expect(result.confidence).toBeGreaterThan(0.2);
    });

    it('should classify outage complaint with error codes', () => {
      const result = classifier.classify(
        'Discord returning 503 errors, completely broken!',
        [makeEntity({ errorCode: '503' })],
      );
      expect(result.category).toBe(Sentiment.OUTAGE_COMPLAINT);
    });

    it('should classify question: "Is Netflix down for anyone else?"', () => {
      const result = classifier.classify(
        'Is Netflix down for anyone else?',
        [makeEntity({ serviceName: 'Netflix', serviceSlug: 'netflix' })],
      );
      expect(result.category).toBe(Sentiment.QUESTION);
    });

    it('should classify question: "just me or is Discord not working?"', () => {
      const result = classifier.classify(
        'just me? is Discord not working?',
        [makeEntity()],
      );
      expect(result.category).toBe(Sentiment.QUESTION);
    });

    it('should classify humor: "RIP Steam servers"', () => {
      const result = classifier.classify('RIP Steam servers', [
        makeEntity({ serviceName: 'Steam', serviceSlug: 'steam' }),
      ]);
      expect(result.category).toBe(Sentiment.HUMOR_MEME);
    });

    it('should classify humor: "F in chat for Discord"', () => {
      const result = classifier.classify('F in chat for Discord users right now lol', [
        makeEntity(),
      ]);
      expect(result.category).toBe(Sentiment.HUMOR_MEME);
    });

    it('should classify service announcement: "Scheduled maintenance for GitHub tonight"', () => {
      const result = classifier.classify(
        'Scheduled maintenance for GitHub tonight at 10pm UTC',
        [makeEntity({ serviceName: 'GitHub', serviceSlug: 'github' })],
      );
      expect(result.category).toBe(Sentiment.SERVICE_ANNOUNCEMENT);
    });

    it('should classify service announcement: incident report', () => {
      const result = classifier.classify(
        'Incident report: GitHub post-mortem for yesterday outage published',
        [makeEntity({ serviceName: 'GitHub', serviceSlug: 'github' })],
      );
      expect(result.category).toBe(Sentiment.SERVICE_ANNOUNCEMENT);
    });

    it('should classify unrelated: "I love using Spotify"', () => {
      const result = classifier.classify('I love using Spotify', []);
      expect(result.category).toBe(Sentiment.UNRELATED);
    });

    it('should classify unrelated for generic positive text', () => {
      const result = classifier.classify(
        'Had a great day coding and deploying my new feature',
        [],
      );
      expect(result.category).toBe(Sentiment.UNRELATED);
    });

    it('should return confidence between 0 and 1', () => {
      const result = classifier.classify('WHY IS EVERYTHING BROKEN!!!', [makeEntity()]);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should return language intensity between 0 and 1', () => {
      const result = classifier.classify(
        'WHY IS DISCORD DOWN?! THIS IS RIDICULOUS!!!',
        [makeEntity()],
      );
      expect(result.languageIntensity).toBeGreaterThanOrEqual(0);
      expect(result.languageIntensity).toBeLessThanOrEqual(1);
    });

    it('should have higher language intensity for angry caps text', () => {
      const calm = classifier.classify('discord seems to be having some issues', [
        makeEntity(),
      ]);
      const angry = classifier.classify(
        'WHY IS DISCORD DOWN AGAIN?! THIS IS ABSOLUTELY RIDICULOUS!!!',
        [makeEntity()],
      );
      expect(angry.languageIntensity).toBeGreaterThan(calm.languageIntensity);
    });
  });

  describe('scoreUrgency', () => {
    it('should score higher urgency for angry text with specific error', () => {
      const angryResult = classifier.classify(
        'DISCORD IS COMPLETELY BROKEN! 503 ERROR EVERYWHERE!!!',
        [makeEntity({ errorCode: '503', symptoms: ['broken', 'error'] })],
      );
      const angryUrgency = classifier.scoreUrgency(angryResult, [
        makeEntity({ errorCode: '503', symptoms: ['broken', 'error'] }),
      ]);

      const calmResult = classifier.classify(
        'discord seems a bit slow today',
        [makeEntity({ symptoms: ['slow'] })],
      );
      const calmUrgency = classifier.scoreUrgency(calmResult, [
        makeEntity({ symptoms: ['slow'] }),
      ]);

      expect(angryUrgency).toBeGreaterThan(calmUrgency);
    });

    it('should return urgency between 0 and 1', () => {
      const result = classifier.classify('Discord is down!!!', [makeEntity()]);
      const urgency = classifier.scoreUrgency(result, [makeEntity()]);
      expect(urgency).toBeGreaterThanOrEqual(0);
      expect(urgency).toBeLessThanOrEqual(1);
    });

    it('should give low urgency to unrelated posts', () => {
      const result = classifier.classify('I love using Spotify', []);
      const urgency = classifier.scoreUrgency(result, []);
      expect(urgency).toBeLessThan(0.2);
    });

    it('should boost urgency when error codes are present', () => {
      const withError = classifier.classify('Discord error 503', [
        makeEntity({ errorCode: '503' }),
      ]);
      const urgencyWithError = classifier.scoreUrgency(withError, [
        makeEntity({ errorCode: '503' }),
      ]);

      const withoutError = classifier.classify('Discord is having issues', [
        makeEntity(),
      ]);
      const urgencyWithoutError = classifier.scoreUrgency(withoutError, [
        makeEntity(),
      ]);

      expect(urgencyWithError).toBeGreaterThan(urgencyWithoutError);
    });

    it('should boost urgency with more symptoms', () => {
      const fewSymptoms = classifier.classify('Discord is slow', [
        makeEntity({ symptoms: ['slow'] }),
      ]);
      const fewUrgency = classifier.scoreUrgency(fewSymptoms, [
        makeEntity({ symptoms: ['slow'] }),
      ]);

      const manySymptoms = classifier.classify(
        "Discord is slow, broken, timeout, can't connect",
        [makeEntity({ symptoms: ['slow', 'broken', 'timeout', "can't connect"] })],
      );
      const manyUrgency = classifier.scoreUrgency(manySymptoms, [
        makeEntity({ symptoms: ['slow', 'broken', 'timeout', "can't connect"] }),
      ]);

      expect(manyUrgency).toBeGreaterThan(fewUrgency);
    });
  });
});
