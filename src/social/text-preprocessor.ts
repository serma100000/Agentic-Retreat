/**
 * Text preprocessing pipeline for social media posts.
 *
 * Handles cleaning, normalization, hashtag extraction, language detection,
 * and near-duplicate detection using MinHash signatures.
 */

const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;
const MENTION_REGEX = /@[\w]+/g;
const HASHTAG_REGEX = /#([\w]+)/g;
const MULTI_WHITESPACE_REGEX = /\s{2,}/g;

/**
 * Common English words used for language detection heuristic.
 * Frequency-ranked so that the presence of these words strongly
 * indicates English text.
 */
const ENGLISH_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
  'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
  'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
  'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
  'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
  'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'has',
  'had', 'did', 'does', 'am', 'being', 'having', 'doing', 'down', 'working',
  'anyone', 'else', 'again', 'still', 'much', 'every', 'same', 'right',
]);

/**
 * Default number of hash functions for MinHash.
 */
const DEFAULT_NUM_HASHES = 128;

/**
 * Default near-duplicate threshold (Jaccard similarity).
 */
const DEFAULT_DUPLICATE_THRESHOLD = 0.7;

export class TextPreprocessor {
  private readonly numHashes: number;

  constructor(numHashes: number = DEFAULT_NUM_HASHES) {
    this.numHashes = numHashes;
  }

  /**
   * Clean social media text: remove URLs, @mentions, excess whitespace,
   * normalize unicode, and trim.
   */
  clean(text: string): string {
    let cleaned = text;

    // Normalize unicode (NFC form)
    cleaned = cleaned.normalize('NFC');

    // Remove URLs
    cleaned = cleaned.replace(URL_REGEX, '');

    // Remove @mentions
    cleaned = cleaned.replace(MENTION_REGEX, '');

    // Collapse multiple whitespace to single space
    cleaned = cleaned.replace(MULTI_WHITESPACE_REGEX, ' ');

    // Trim
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Extract hashtags from text, returning them without the # prefix.
   */
  extractHashtags(text: string): string[] {
    const hashtags: string[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(HASHTAG_REGEX.source, 'g');

    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        hashtags.push(match[1]);
      }
    }

    return hashtags;
  }

  /**
   * Simple heuristic language detection based on English word frequency.
   * Returns the detected language code and confidence score.
   */
  detectLanguage(text: string): { language: string; confidence: number } {
    const words = text
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (words.length === 0) {
      return { language: 'unknown', confidence: 0 };
    }

    let englishCount = 0;
    for (const word of words) {
      if (ENGLISH_WORDS.has(word)) {
        englishCount++;
      }
    }

    const ratio = englishCount / words.length;

    if (ratio >= 0.25) {
      return { language: 'en', confidence: Math.min(ratio * 2, 1.0) };
    }

    return { language: 'other', confidence: 1.0 - ratio };
  }

  /**
   * Check if two texts are near-duplicates using MinHash-based
   * Jaccard similarity estimation.
   */
  isNearDuplicate(
    text1: string,
    text2: string,
    threshold: number = DEFAULT_DUPLICATE_THRESHOLD,
  ): boolean {
    const sig1 = this.generateMinHash(text1);
    const sig2 = this.generateMinHash(text2);
    const similarity = this.estimateJaccard(sig1, sig2);
    return similarity >= threshold;
  }

  /**
   * Generate a MinHash signature for a text.
   * The text is tokenized into character n-grams (shingles), then
   * multiple hash functions are applied to produce the signature.
   */
  generateMinHash(text: string, numHashes: number = this.numHashes): number[] {
    const shingles = this.shingle(text.toLowerCase(), 3);

    if (shingles.size === 0) {
      return new Array(numHashes).fill(0) as number[];
    }

    const signature: number[] = new Array(numHashes).fill(Infinity) as number[];

    for (const shingle of shingles) {
      for (let i = 0; i < numHashes; i++) {
        const hashVal = this.murmurLike(shingle, i);
        if (hashVal < signature[i]!) {
          signature[i] = hashVal;
        }
      }
    }

    return signature;
  }

  /**
   * Estimate Jaccard similarity from two MinHash signatures.
   */
  estimateJaccard(sig1: number[], sig2: number[]): number {
    if (sig1.length !== sig2.length || sig1.length === 0) {
      return 0;
    }

    let matches = 0;
    for (let i = 0; i < sig1.length; i++) {
      if (sig1[i] === sig2[i]) {
        matches++;
      }
    }

    return matches / sig1.length;
  }

  /**
   * Generate character n-gram shingles from text.
   */
  private shingle(text: string, n: number): Set<string> {
    const shingles = new Set<string>();
    const cleaned = text.replace(/\s+/g, ' ').trim();

    for (let i = 0; i <= cleaned.length - n; i++) {
      shingles.add(cleaned.substring(i, i + n));
    }

    return shingles;
  }

  /**
   * Simple hash function seeded by index, inspired by Murmur.
   * Returns a 32-bit unsigned integer.
   */
  private murmurLike(str: string, seed: number): number {
    let h = seed ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995);
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
    }
    h ^= h >>> 15;
    return h >>> 0;
  }
}
