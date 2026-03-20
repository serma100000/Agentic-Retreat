/**
 * Rule-based sentiment classifier for outage-related social media posts.
 *
 * Classifies posts into sentiment categories (outage complaint, question,
 * humor, service announcement, unrelated) and scores urgency.
 * Designed as an MVP with a clear interface for later ML replacement.
 */

import { Sentiment } from './types.js';
import type { SentimentType, SentimentResult, EntityExtraction, UrgencyScore } from './types.js';

interface ScoringRule {
  pattern: RegExp;
  weight: number;
}

const OUTAGE_COMPLAINT_RULES: ScoringRule[] = [
  { pattern: /\bdown\b/i, weight: 0.25 },
  { pattern: /\bbroken\b/i, weight: 0.25 },
  { pattern: /\boutage\b/i, weight: 0.35 },
  { pattern: /not\s*working/i, weight: 0.3 },
  { pattern: /can'?t\s*access/i, weight: 0.3 },
  { pattern: /\berror\b/i, weight: 0.2 },
  { pattern: /\bfailed?\b/i, weight: 0.2 },
  { pattern: /\bcrash/i, weight: 0.25 },
  { pattern: /\bunreachable\b/i, weight: 0.25 },
  { pattern: /won'?t\s*load/i, weight: 0.25 },
  { pattern: /\btimeout\b/i, weight: 0.2 },
  { pattern: /\b5\d{2}\b/, weight: 0.2 },
  { pattern: /\bwhy\b.*\bdown\b/i, weight: 0.15 },
  { pattern: /\bagain\b/i, weight: 0.1 },
  { pattern: /\bridiculous\b/i, weight: 0.1 },
  { pattern: /\baffecting\b/i, weight: 0.15 },
  { pattern: /\bimpact/i, weight: 0.1 },
];

const QUESTION_RULES: ScoringRule[] = [
  { pattern: /\bis\s+\w+\s+down\s*\?/i, weight: 0.4 },
  { pattern: /anyone\s*else/i, weight: 0.35 },
  { pattern: /just\s*me\s*\?/i, weight: 0.35 },
  { pattern: /happening\s*to\s*anyone/i, weight: 0.35 },
  { pattern: /is\s*it\s*just\s*me/i, weight: 0.3 },
  { pattern: /anyone\s*(having|experiencing)/i, weight: 0.3 },
  { pattern: /does\s*anyone\s*know/i, weight: 0.25 },
  { pattern: /\?$/, weight: 0.1 },
  { pattern: /\?\s*$/, weight: 0.1 },
];

const HUMOR_MEME_RULES: ScoringRule[] = [
  { pattern: /\bRIP\b/, weight: 0.35 },
  { pattern: /F\s+in\s+(the\s+)?chat/i, weight: 0.4 },
  { pattern: /\blol\b/i, weight: 0.15 },
  { pattern: /\blmao\b/i, weight: 0.2 },
  { pattern: /\brofl\b/i, weight: 0.2 },
  { pattern: /\b(haha|hehe|hihi)\b/i, weight: 0.15 },
  { pattern: /[\u{1F602}\u{1F923}\u{1F62D}\u{1F480}\u{1FAA6}]/u, weight: 0.25 },
  { pattern: /\bpress\s*F\b/i, weight: 0.35 },
  { pattern: /surprise.*pikachu/i, weight: 0.3 },
  { pattern: /\bclown\b/i, weight: 0.15 },
  { pattern: /\bbruh\b/i, weight: 0.1 },
];

const ANNOUNCEMENT_RULES: ScoringRule[] = [
  { pattern: /\bmaintenance\b/i, weight: 0.4 },
  { pattern: /\bscheduled\b/i, weight: 0.35 },
  { pattern: /\bupdating\b/i, weight: 0.15 },
  { pattern: /\bdeploying\b/i, weight: 0.15 },
  { pattern: /\bplanned\b/i, weight: 0.3 },
  { pattern: /\bwindow\b.*\b(utc|est|pst)\b/i, weight: 0.25 },
  { pattern: /\bpost-?\s*mortem\b/i, weight: 0.3 },
  { pattern: /\bincident\s*report\b/i, weight: 0.3 },
  { pattern: /\bstatus\s*page\b/i, weight: 0.2 },
  { pattern: /\bPSA\b/, weight: 0.2 },
  { pattern: /\bheads\s*up\b/i, weight: 0.15 },
];

/**
 * Words that indicate profanity or strong negative emotion.
 */
const PROFANITY_PATTERNS = [
  /\b(wtf|wth)\b/i,
  /\b(damn|dammit)\b/i,
  /\b(hell)\b/i,
  /\bffs\b/i,
  /\bsmh\b/i,
];

/**
 * Negative words contributing to language intensity.
 */
const NEGATIVE_WORDS = [
  'terrible', 'awful', 'horrible', 'worst', 'pathetic',
  'unacceptable', 'ridiculous', 'useless', 'garbage', 'trash',
  'frustrated', 'angry', 'furious', 'annoyed', 'disgusted',
  'incompetent', 'disaster', 'nightmare', 'atrocious', 'abysmal',
];

export class SentimentClassifier {
  /**
   * Classify a social media post into a sentiment category.
   */
  classify(text: string, entities: EntityExtraction[]): SentimentResult {
    const scores = new Map<SentimentType, number>();

    scores.set(Sentiment.OUTAGE_COMPLAINT, this.scoreRules(text, OUTAGE_COMPLAINT_RULES));
    scores.set(Sentiment.QUESTION, this.scoreRules(text, QUESTION_RULES));
    scores.set(Sentiment.HUMOR_MEME, this.scoreRules(text, HUMOR_MEME_RULES));
    scores.set(Sentiment.SERVICE_ANNOUNCEMENT, this.scoreRules(text, ANNOUNCEMENT_RULES));

    // Boost complaint score if entities were found with high confidence
    if (entities.length > 0) {
      const avgEntityConfidence =
        entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length;
      const currentComplaint = scores.get(Sentiment.OUTAGE_COMPLAINT) ?? 0;
      scores.set(Sentiment.OUTAGE_COMPLAINT, currentComplaint + avgEntityConfidence * 0.15);
    }

    // Find category with highest score
    let bestCategory: SentimentType = Sentiment.UNRELATED;
    let bestScore = 0.2; // Minimum threshold for any category

    for (const [category, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    const languageIntensity = this.measureLanguageIntensity(text);

    // Cap confidence at 1.0
    const confidence = Math.min(bestScore, 1.0);

    return {
      category: bestCategory,
      confidence: Math.round(confidence * 100) / 100,
      languageIntensity: Math.round(languageIntensity * 100) / 100,
    };
  }

  /**
   * Score urgency combining sentiment, entity extraction, and language signals.
   * Returns 0.0 to 1.0.
   */
  scoreUrgency(sentiment: SentimentResult, entities: EntityExtraction[]): UrgencyScore {
    let urgency = 0;

    // Base urgency from sentiment category
    switch (sentiment.category) {
      case Sentiment.OUTAGE_COMPLAINT:
        urgency = 0.5;
        break;
      case Sentiment.QUESTION:
        urgency = 0.3;
        break;
      case Sentiment.SERVICE_ANNOUNCEMENT:
        urgency = 0.4;
        break;
      case Sentiment.HUMOR_MEME:
        urgency = 0.2;
        break;
      case Sentiment.UNRELATED:
        urgency = 0.05;
        break;
    }

    // Boost from language intensity (emotional content)
    urgency += sentiment.languageIntensity * 0.2;

    // Boost from entity confidence
    if (entities.length > 0) {
      const maxConfidence = Math.max(...entities.map((e) => e.confidence));
      urgency += maxConfidence * 0.15;
    }

    // Boost from specific error codes
    const hasErrorCode = entities.some((e) => e.errorCode !== undefined);
    if (hasErrorCode) {
      urgency += 0.1;
    }

    // Boost from symptom specificity
    const allSymptoms = entities.flatMap((e) => e.symptoms);
    const uniqueSymptoms = new Set(allSymptoms);
    urgency += Math.min(uniqueSymptoms.size * 0.03, 0.15);

    return Math.round(Math.min(Math.max(urgency, 0), 1.0) * 100) / 100;
  }

  /**
   * Measure language intensity based on caps, punctuation, negative words,
   * and profanity. Returns 0.0 to 1.0.
   */
  private measureLanguageIntensity(text: string): number {
    let intensity = 0;

    // Caps ratio (exclude short texts)
    if (text.length > 10) {
      const letters = text.replace(/[^a-zA-Z]/g, '');
      if (letters.length > 0) {
        const upperCount = (letters.match(/[A-Z]/g) ?? []).length;
        const capsRatio = upperCount / letters.length;
        if (capsRatio > 0.5) {
          intensity += capsRatio * 0.3;
        }
      }
    }

    // Exclamation marks
    const exclamationCount = (text.match(/!/g) ?? []).length;
    intensity += Math.min(exclamationCount * 0.08, 0.25);

    // Negative word density
    const textLower = text.toLowerCase();
    const words = textLower.split(/\s+/);
    let negativeCount = 0;
    for (const word of words) {
      if (NEGATIVE_WORDS.includes(word)) {
        negativeCount++;
      }
    }
    if (words.length > 0) {
      intensity += Math.min((negativeCount / words.length) * 2, 0.25);
    }

    // Profanity
    let profanityCount = 0;
    for (const pattern of PROFANITY_PATTERNS) {
      if (pattern.test(text)) {
        profanityCount++;
      }
    }
    intensity += Math.min(profanityCount * 0.1, 0.2);

    return Math.min(intensity, 1.0);
  }

  private scoreRules(text: string, rules: ScoringRule[]): number {
    let score = 0;
    for (const rule of rules) {
      if (rule.pattern.test(text)) {
        score += rule.weight;
      }
    }
    return score;
  }
}
