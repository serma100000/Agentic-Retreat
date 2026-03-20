import { describe, it, expect, beforeEach } from 'vitest';
import { TextPreprocessor } from '../text-preprocessor.js';

describe('TextPreprocessor', () => {
  let preprocessor: TextPreprocessor;

  beforeEach(() => {
    preprocessor = new TextPreprocessor();
  });

  describe('clean', () => {
    it('should remove URLs', () => {
      const input = 'Discord is down https://t.co/abc123 check status';
      const result = preprocessor.clean(input);
      expect(result).toBe('Discord is down check status');
    });

    it('should remove multiple URLs', () => {
      const input = 'Check https://example.com and http://status.io for updates';
      const result = preprocessor.clean(input);
      expect(result).toBe('Check and for updates');
    });

    it('should remove @mentions', () => {
      const input = '@discord @support Why is Discord not working??';
      const result = preprocessor.clean(input);
      expect(result).toBe('Why is Discord not working??');
    });

    it('should normalize excess whitespace', () => {
      const input = 'Discord    is     down     again';
      const result = preprocessor.clean(input);
      expect(result).toBe('Discord is down again');
    });

    it('should trim leading and trailing whitespace', () => {
      const input = '   Discord is down   ';
      const result = preprocessor.clean(input);
      expect(result).toBe('Discord is down');
    });

    it('should handle combined cleaning', () => {
      const input =
        '@user1 Discord is down https://t.co/abc   check @support for updates   ';
      const result = preprocessor.clean(input);
      expect(result).toBe('Discord is down check for updates');
    });

    it('should normalize unicode', () => {
      // e + combining accent vs pre-composed
      const input = 'caf\u0065\u0301'; // "café" with combining accent
      const result = preprocessor.clean(input);
      expect(result).toBe('caf\u00e9'); // NFC form
    });
  });

  describe('extractHashtags', () => {
    it('should extract single hashtag', () => {
      const input = 'Discord is #down again';
      expect(preprocessor.extractHashtags(input)).toEqual(['down']);
    });

    it('should extract multiple hashtags', () => {
      const input = '#Discord #outage #serverdown happening now';
      expect(preprocessor.extractHashtags(input)).toEqual([
        'Discord',
        'outage',
        'serverdown',
      ]);
    });

    it('should return empty array when no hashtags', () => {
      const input = 'Just a normal tweet about Discord';
      expect(preprocessor.extractHashtags(input)).toEqual([]);
    });

    it('should handle hashtags at end of text', () => {
      const input = 'This is bad #outage';
      expect(preprocessor.extractHashtags(input)).toEqual(['outage']);
    });
  });

  describe('detectLanguage', () => {
    it('should detect English text', () => {
      const input = 'The service is not working and I am having issues with it';
      const result = preprocessor.detectLanguage(input);
      expect(result.language).toBe('en');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should detect non-English text', () => {
      const input = 'Der Dienst funktioniert nicht mehr seit heute morgen leider';
      const result = preprocessor.detectLanguage(input);
      expect(result.language).toBe('other');
    });

    it('should handle empty text', () => {
      const result = preprocessor.detectLanguage('');
      expect(result.language).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    it('should handle text with numbers and symbols only', () => {
      const result = preprocessor.detectLanguage('123 456 !!! ???');
      expect(result.language).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    it('should detect mixed text with enough English as English', () => {
      const input = 'Discord is down this is not good for our team today';
      const result = preprocessor.detectLanguage(input);
      expect(result.language).toBe('en');
    });
  });

  describe('MinHash near-duplicate detection', () => {
    it('should detect same tweet with minor edits as duplicate', () => {
      const text1 = 'Discord is down again! This is ridiculous!';
      const text2 = 'Discord is down again! This is so ridiculous!';
      expect(preprocessor.isNearDuplicate(text1, text2)).toBe(true);
    });

    it('should detect exact duplicates', () => {
      const text = 'GitHub is not working for anyone else?';
      expect(preprocessor.isNearDuplicate(text, text)).toBe(true);
    });

    it('should not flag different tweets as duplicates', () => {
      const text1 = 'Discord is down again! This is ridiculous!';
      const text2 = 'I love using Spotify for my workout playlists';
      expect(preprocessor.isNearDuplicate(text1, text2)).toBe(false);
    });

    it('should not flag related but different content as duplicates', () => {
      const text1 = 'AWS S3 is having major outage in us-east-1';
      const text2 = 'Google Cloud Storage is experiencing latency in europe-west';
      expect(preprocessor.isNearDuplicate(text1, text2)).toBe(false);
    });

    it('should detect retweet-style near-duplicates', () => {
      const text1 = 'BREAKING: Discord servers are down worldwide';
      const text2 = 'RT: BREAKING: Discord servers are down worldwide';
      expect(preprocessor.isNearDuplicate(text1, text2, 0.6)).toBe(true);
    });
  });

  describe('generateMinHash', () => {
    it('should produce signatures of specified length', () => {
      const sig = preprocessor.generateMinHash('test input', 64);
      expect(sig).toHaveLength(64);
    });

    it('should produce consistent signatures for same input', () => {
      const sig1 = preprocessor.generateMinHash('Discord is down');
      const sig2 = preprocessor.generateMinHash('Discord is down');
      expect(sig1).toEqual(sig2);
    });

    it('should produce different signatures for different inputs', () => {
      const sig1 = preprocessor.generateMinHash('Discord is down');
      const sig2 = preprocessor.generateMinHash('Spotify is amazing');
      expect(sig1).not.toEqual(sig2);
    });
  });

  describe('estimateJaccard', () => {
    it('should return 1.0 for identical signatures', () => {
      const sig = preprocessor.generateMinHash('identical text');
      expect(preprocessor.estimateJaccard(sig, sig)).toBe(1.0);
    });

    it('should return low similarity for very different texts', () => {
      const sig1 = preprocessor.generateMinHash('Discord is completely broken today');
      const sig2 = preprocessor.generateMinHash('Beautiful sunset over the mountains');
      expect(preprocessor.estimateJaccard(sig1, sig2)).toBeLessThan(0.3);
    });
  });
});
