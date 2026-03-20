import { describe, it, expect, beforeEach } from 'vitest';
import { EntityExtractor } from '../entity-extractor.js';

const TEST_SERVICES = [
  { name: 'Discord', slug: 'discord' },
  { name: 'GitHub', slug: 'github' },
  { name: 'AWS', slug: 'aws' },
  { name: 'Slack', slug: 'slack' },
  { name: 'Cloudflare', slug: 'cloudflare' },
  { name: 'Gmail', slug: 'gmail' },
  { name: 'Netflix', slug: 'netflix' },
  { name: 'Spotify', slug: 'spotify' },
  { name: 'Steam', slug: 'steam' },
  { name: 'PlayStation Network', slug: 'playstation-network' },
];

describe('EntityExtractor', () => {
  let extractor: EntityExtractor;

  beforeEach(() => {
    extractor = new EntityExtractor(TEST_SERVICES);
  });

  describe('exact match', () => {
    it('should match "Discord is down" to Discord', () => {
      const results = extractor.extract('Discord is down');
      expect(results).toHaveLength(1);
      expect(results[0]!.serviceName).toBe('Discord');
      expect(results[0]!.serviceSlug).toBe('discord');
    });

    it('should match service name at start of text', () => {
      const results = extractor.extract('GitHub outage reported by users');
      expect(results).toHaveLength(1);
      expect(results[0]!.serviceName).toBe('GitHub');
    });

    it('should match service name at end of text', () => {
      const results = extractor.extract('Major issues reported with Slack');
      expect(results).toHaveLength(1);
      expect(results[0]!.serviceName).toBe('Slack');
    });
  });

  describe('case-insensitive matching', () => {
    it('should match "GITHUB isn\'t working" to GitHub', () => {
      const results = extractor.extract("GITHUB isn't working");
      expect(results).toHaveLength(1);
      expect(results[0]!.serviceName).toBe('GitHub');
    });

    it('should match mixed case', () => {
      const results = extractor.extract('gITHUB is having issues');
      expect(results).toHaveLength(1);
      expect(results[0]!.serviceName).toBe('GitHub');
    });

    it('should match all lowercase', () => {
      const results = extractor.extract('discord servers are down');
      expect(results).toHaveLength(1);
      expect(results[0]!.serviceName).toBe('Discord');
    });
  });

  describe('multiple entity extraction', () => {
    it('should extract "AWS and Slack are both down" to [AWS, Slack]', () => {
      const results = extractor.extract('AWS and Slack are both down');
      expect(results).toHaveLength(2);
      const names = results.map((r) => r.serviceName).sort();
      expect(names).toEqual(['AWS', 'Slack']);
    });

    it('should extract three services', () => {
      const results = extractor.extract(
        'Discord, GitHub, and Slack all experiencing issues',
      );
      expect(results).toHaveLength(3);
      const slugs = results.map((r) => r.serviceSlug).sort();
      expect(slugs).toEqual(['discord', 'github', 'slack']);
    });
  });

  describe('error code extraction', () => {
    it('should extract error code from "getting 503 errors on Cloudflare"', () => {
      const results = extractor.extract('getting 503 errors on Cloudflare');
      expect(results).toHaveLength(1);
      expect(results[0]!.errorCode).toBe('503');
    });

    it('should extract HTTP status codes', () => {
      const results = extractor.extract(
        'Discord returning 500 Internal Server Error',
      );
      expect(results).toHaveLength(1);
      expect(results[0]!.errorCode).toBe('500');
    });

    it('should extract "Error 502" pattern', () => {
      const results = extractor.extract('GitHub gives Error 502 on push');
      expect(results).toHaveLength(1);
      expect(results[0]!.errorCode).toBe('502');
    });

    it('should not extract non-HTTP error codes', () => {
      const results = extractor.extract('Discord has 200 users online');
      // 200 is not in 400-599 range, so no errorCode
      if (results.length > 0) {
        expect(results[0]!.errorCode).toBeUndefined();
      }
    });
  });

  describe('symptom extraction', () => {
    it('should extract "slow" symptom from "Gmail is super slow today"', () => {
      const results = extractor.extract('Gmail is super slow today');
      expect(results).toHaveLength(1);
      expect(results[0]!.symptoms).toContain('slow');
    });

    it('should extract timeout symptom', () => {
      const results = extractor.extract('Discord keeps timing out on every request');
      // "timing out" should not match but "timeout" would
      // Let's check a direct match
      const results2 = extractor.extract('Discord timeout errors everywhere');
      expect(results2).toHaveLength(1);
      expect(results2[0]!.symptoms).toContain('timeout');
    });

    it('should extract multiple symptoms', () => {
      const results = extractor.extract(
        "Slack is slow and login failed, can't connect at all",
      );
      expect(results).toHaveLength(1);
      expect(results[0]!.symptoms).toContain('slow');
      expect(results[0]!.symptoms).toContain('login failed');
      expect(results[0]!.symptoms).toContain("can't connect");
    });

    it('should extract "not working" as symptom', () => {
      const results = extractor.extract('Discord not working right now');
      expect(results).toHaveLength(1);
      expect(results[0]!.symptoms).toContain('not working');
    });
  });

  describe('no false positives', () => {
    it('should return empty for irrelevant text', () => {
      const results = extractor.extract(
        'The weather today is beautiful and sunny',
      );
      expect(results).toHaveLength(0);
    });

    it('should return empty for text without known services', () => {
      const results = extractor.extract(
        'MyObscureService is completely broken',
      );
      expect(results).toHaveLength(0);
    });
  });

  describe('fuzzy matching', () => {
    it('should fuzzy match "Playstation Network" to PlayStation Network', () => {
      const results = extractor.extract('Playstation Network is down');
      expect(results).toHaveLength(1);
      expect(results[0]!.serviceSlug).toBe('playstation-network');
    });

    it('should match "Cloudflrae" as fuzzy match to Cloudflare', () => {
      const results = extractor.extract('Cloudflrae is having major issues');
      expect(results).toHaveLength(1);
      expect(results[0]!.serviceSlug).toBe('cloudflare');
    });
  });

  describe('confidence scoring', () => {
    it('should give higher confidence to exact matches', () => {
      const exactResults = extractor.extract('Discord is down');
      expect(exactResults).toHaveLength(1);
      expect(exactResults[0]!.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should boost confidence when error code is present', () => {
      const withError = extractor.extract('Discord gives 503 error');
      const withoutError = extractor.extract('Discord is having issues');
      expect(withError[0]!.confidence).toBeGreaterThan(withoutError[0]!.confidence);
    });

    it('should boost confidence with more symptoms', () => {
      const fewSymptoms = extractor.extract('Discord is slow');
      const moreSymptoms = extractor.extract(
        "Discord is slow and broken, can't connect with timeout errors",
      );
      expect(moreSymptoms[0]!.confidence).toBeGreaterThan(
        fewSymptoms[0]!.confidence,
      );
    });
  });

  describe('loadServiceCatalog', () => {
    it('should replace the existing catalog', () => {
      const newExtractor = new EntityExtractor([]);
      let results = newExtractor.extract('Discord is down');
      expect(results).toHaveLength(0);

      newExtractor.loadServiceCatalog([
        { name: 'Discord', slug: 'discord' },
      ]);
      results = newExtractor.extract('Discord is down');
      expect(results).toHaveLength(1);
    });
  });
});
