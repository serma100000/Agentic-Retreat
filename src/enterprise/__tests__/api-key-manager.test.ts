import { describe, it, expect, beforeEach } from 'vitest';
import { ApiKeyManager } from '../auth/api-key-manager.js';

describe('ApiKeyManager', () => {
  let manager: ApiKeyManager;

  beforeEach(() => {
    manager = new ApiKeyManager();
  });

  // ── Key creation ────────────────────────────────────────────

  it('creates a key with the correct prefix for free tier', () => {
    const result = manager.createKey('user-1', 'My Key', ['read:status'], 'free');
    expect(result.key).toMatch(/^op_f_/);
    expect(result.prefix).toBe('op_f_');
    expect(result.keyId).toBeDefined();
  });

  it('creates a key with the correct prefix for pro tier', () => {
    const result = manager.createKey('user-1', 'Pro Key', ['read:status'], 'pro');
    expect(result.key).toMatch(/^op_p_/);
    expect(result.prefix).toBe('op_p_');
  });

  it('creates a key with the correct prefix for enterprise tier', () => {
    const result = manager.createKey('user-1', 'Ent Key', ['read:status'], 'enterprise');
    expect(result.key).toMatch(/^op_e_/);
    expect(result.prefix).toBe('op_e_');
  });

  it('returns the raw key only once (not stored in plaintext)', () => {
    const result = manager.createKey('user-1', 'Key', ['read:status'], 'free');
    const keys = manager.listKeys('user-1');
    // Listed keys should not contain the raw key
    expect(keys[0]).not.toHaveProperty('key');
    expect(keys[0]).not.toHaveProperty('keyHash');
    // But creation result includes the raw key
    expect(result.key.length).toBeGreaterThan(10);
  });

  // ── Key validation ──────────────────────────────────────────

  it('validates a key and returns correct user and scopes', () => {
    const { key } = manager.createKey('user-1', 'Key', ['read:status', 'read:incidents'], 'free');
    const result = manager.validateKey(key);
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
    expect(result!.userId).toBe('user-1');
    expect(result!.scopes).toEqual(['read:status', 'read:incidents']);
    expect(result!.tier).toBe('free');
  });

  it('returns correct rate limit per tier', () => {
    const free = manager.createKey('user-1', 'F', ['read:status'], 'free');
    const pro = manager.createKey('user-2', 'P', ['read:status'], 'pro');
    const ent = manager.createKey('user-3', 'E', ['read:status'], 'enterprise');

    expect(manager.validateKey(free.key)!.rateLimitPerMin).toBe(100);
    expect(manager.validateKey(pro.key)!.rateLimitPerMin).toBe(1000);
    expect(manager.validateKey(ent.key)!.rateLimitPerMin).toBe(10000);
  });

  it('returns null for an unknown key', () => {
    expect(manager.validateKey('op_f_nonexistent')).toBeNull();
  });

  // ── Key revocation ──────────────────────────────────────────

  it('revokes a key and subsequent validation returns null', () => {
    const { key, keyId } = manager.createKey('user-1', 'Key', ['read:status'], 'free');
    expect(manager.validateKey(key)).not.toBeNull();

    const revoked = manager.revokeKey(keyId, 'user-1');
    expect(revoked).toBe(true);
    expect(manager.validateKey(key)).toBeNull();
  });

  it('cannot revoke another users key', () => {
    const { keyId } = manager.createKey('user-1', 'Key', ['read:status'], 'free');
    const revoked = manager.revokeKey(keyId, 'user-2');
    expect(revoked).toBe(false);
  });

  it('returns false when revoking a non-existent key', () => {
    expect(manager.revokeKey('no-such-id', 'user-1')).toBe(false);
  });

  // ── Key listing ─────────────────────────────────────────────

  it('lists all keys for a user', () => {
    manager.createKey('user-1', 'Key A', ['read:status'], 'free');
    manager.createKey('user-1', 'Key B', ['read:incidents'], 'pro');
    manager.createKey('user-2', 'Key C', ['read:status'], 'free');

    const keys = manager.listKeys('user-1');
    expect(keys).toHaveLength(2);
    expect(keys.map((k) => k.name)).toEqual(['Key A', 'Key B']);
  });

  // ── Last used tracking ──────────────────────────────────────

  it('updates lastUsedAt when a key is validated', () => {
    const { key } = manager.createKey('user-1', 'Key', ['read:status'], 'free');
    const before = manager.listKeys('user-1')[0]!.lastUsedAt;
    expect(before).toBeNull();

    manager.validateKey(key);
    const after = manager.listKeys('user-1')[0]!.lastUsedAt;
    expect(after).not.toBeNull();
    expect(after!.getTime()).toBeGreaterThan(0);
  });

  // ── Tier enforcement ────────────────────────────────────────

  it('rejects scopes not available on the tier', () => {
    expect(() =>
      manager.createKey('user-1', 'Key', ['admin:org'], 'free'),
    ).toThrow('not available on the free tier');
  });

  it('enforces max keys per tier', () => {
    // Free tier allows 2 keys
    manager.createKey('user-1', 'A', ['read:status'], 'free');
    manager.createKey('user-1', 'B', ['read:status'], 'free');
    expect(() =>
      manager.createKey('user-1', 'C', ['read:status'], 'free'),
    ).toThrow('Maximum number of free keys');
  });

  // ── Static helpers ──────────────────────────────────────────

  it('exposes tier definitions', () => {
    const tier = ApiKeyManager.getTier('enterprise');
    expect(tier.rateLimit).toBe(10_000);
    expect(tier.maxKeys).toBe(50);
    expect(tier.features).toContain('admin:org');
  });

  it('lists all tiers', () => {
    const tiers = ApiKeyManager.getAllTiers();
    expect(tiers).toHaveLength(3);
    expect(tiers.map((t) => t.name).sort()).toEqual(['enterprise', 'free', 'pro']);
  });
});
