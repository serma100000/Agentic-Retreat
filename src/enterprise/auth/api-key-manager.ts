/**
 * API key lifecycle management with tiered rate limits.
 *
 * Key format: op_{tier_letter}_{random_hex}
 * Keys are stored as SHA-256 hashes -- the plaintext is returned exactly once
 * on creation and never persisted.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { ApiKeyRecord, ApiKeyTier, ApiKeyTierName } from '../types.js';

// ── Tier definitions ────────────────────────────────────────────

const TIERS: Record<ApiKeyTierName, ApiKeyTier> = {
  free: {
    name: 'free',
    rateLimit: 100,
    maxKeys: 2,
    features: ['read:status', 'read:incidents'],
  },
  pro: {
    name: 'pro',
    rateLimit: 1000,
    maxKeys: 10,
    features: ['read:status', 'read:incidents', 'write:monitors', 'read:analytics'],
  },
  enterprise: {
    name: 'enterprise',
    rateLimit: 10_000,
    maxKeys: 50,
    features: [
      'read:status',
      'read:incidents',
      'write:monitors',
      'read:analytics',
      'admin:org',
      'write:sla',
      'read:audit-log',
    ],
  },
};

const TIER_PREFIX: Record<ApiKeyTierName, string> = {
  free: 'op_f_',
  pro: 'op_p_',
  enterprise: 'op_e_',
};

// ── Helpers ─────────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function generateId(): string {
  return randomBytes(12).toString('hex');
}

// ── ApiKeyManager ───────────────────────────────────────────────

export class ApiKeyManager {
  /** In-memory store. Replace with DB adapter for production. */
  private keys = new Map<string, ApiKeyRecord>();
  /** Hash -> keyId lookup for fast validation. */
  private hashIndex = new Map<string, string>();

  // ── Create ────────────────────────────────────────────────

  createKey(
    userId: string,
    name: string,
    scopes: string[],
    tier: ApiKeyTierName,
  ): { key: string; keyId: string; prefix: string } {
    const tierConfig = TIERS[tier];
    if (!tierConfig) {
      throw new Error(`Unknown API key tier: ${tier}`);
    }

    // Enforce max keys per user for this tier
    const existingCount = this.listKeys(userId).filter(
      (k) => k.tier === tier && !k.revoked,
    ).length;
    if (existingCount >= tierConfig.maxKeys) {
      throw new Error(
        `Maximum number of ${tier} keys (${tierConfig.maxKeys}) reached`,
      );
    }

    // Validate scopes against tier features
    for (const scope of scopes) {
      if (!tierConfig.features.includes(scope)) {
        throw new Error(
          `Scope "${scope}" is not available on the ${tier} tier`,
        );
      }
    }

    const prefix = TIER_PREFIX[tier]!;
    const rawSecret = randomBytes(32).toString('hex');
    const key = `${prefix}${rawSecret}`;
    const keyHash = sha256(key);
    const keyId = generateId();

    const record: ApiKeyRecord = {
      id: keyId,
      userId,
      name,
      keyHash,
      prefix,
      scopes,
      tier,
      createdAt: new Date(),
      lastUsedAt: null,
      expiresAt: null,
      revoked: false,
    };

    this.keys.set(keyId, record);
    this.hashIndex.set(keyHash, keyId);

    return { key, keyId, prefix };
  }

  // ── Validate ──────────────────────────────────────────────

  validateKey(
    key: string,
  ): {
    valid: boolean;
    userId: string;
    scopes: string[];
    tier: ApiKeyTierName;
    rateLimitPerMin: number;
  } | null {
    const keyHash = sha256(key);
    const keyId = this.hashIndex.get(keyHash);
    if (!keyId) return null;

    const record = this.keys.get(keyId);
    if (!record) return null;

    if (record.revoked) return null;
    if (record.expiresAt && record.expiresAt < new Date()) return null;

    this.updateLastUsed(keyId);

    const tierConfig = TIERS[record.tier];
    return {
      valid: true,
      userId: record.userId,
      scopes: record.scopes,
      tier: record.tier,
      rateLimitPerMin: tierConfig?.rateLimit ?? 0,
    };
  }

  // ── Revoke ────────────────────────────────────────────────

  revokeKey(keyId: string, userId: string): boolean {
    const record = this.keys.get(keyId);
    if (!record) return false;
    if (record.userId !== userId) return false;

    record.revoked = true;
    return true;
  }

  // ── List ──────────────────────────────────────────────────

  listKeys(
    userId: string,
  ): {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    tier: ApiKeyTierName;
    createdAt: Date;
    lastUsedAt: Date | null;
    revoked: boolean;
  }[] {
    const result: ReturnType<ApiKeyManager['listKeys']> = [];
    for (const record of this.keys.values()) {
      if (record.userId === userId) {
        result.push({
          id: record.id,
          name: record.name,
          prefix: record.prefix,
          scopes: record.scopes,
          tier: record.tier,
          createdAt: record.createdAt,
          lastUsedAt: record.lastUsedAt,
          revoked: record.revoked,
        });
      }
    }
    return result;
  }

  // ── Last used ─────────────────────────────────────────────

  updateLastUsed(keyId: string): void {
    const record = this.keys.get(keyId);
    if (record) {
      record.lastUsedAt = new Date();
    }
  }

  // ── Tier info ─────────────────────────────────────────────

  static getTier(name: ApiKeyTierName): ApiKeyTier {
    return TIERS[name]!;
  }

  static getAllTiers(): ApiKeyTier[] {
    return Object.values(TIERS);
  }
}
