import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../auth/session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({
      secret: 'test-secret-key-for-jwt',
      accessTokenTTLSeconds: 900,
      refreshTokenTTLSeconds: 604_800,
    });
  });

  // ── Session creation ────────────────────────────────────────

  it('creates a session with access and refresh tokens', () => {
    const session = manager.createSession('user-1');
    expect(session.accessToken).toBeDefined();
    expect(session.refreshToken).toBeDefined();
    expect(session.expiresAt).toBeInstanceOf(Date);
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('access token is a valid JWT with three segments', () => {
    const session = manager.createSession('user-1');
    const parts = session.accessToken.split('.');
    expect(parts).toHaveLength(3);
  });

  it('includes orgId and role when provided', () => {
    const session = manager.createSession('user-1', undefined, {
      orgId: 'org-42',
      role: 'admin',
    });
    const payload = manager.verifyAccessToken(session.accessToken);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe('user-1');
    expect(payload?.orgId).toBe('org-42');
    expect(payload?.role).toBe('admin');
  });

  // ── Token verification ──────────────────────────────────────

  it('verifies a valid access token and extracts claims', () => {
    const session = manager.createSession('user-99');
    const payload = manager.verifyAccessToken(session.accessToken);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe('user-99');
  });

  it('returns null for a tampered token', () => {
    const session = manager.createSession('user-1');
    const tampered = session.accessToken.slice(0, -5) + 'XXXXX';
    expect(manager.verifyAccessToken(tampered)).toBeNull();
  });

  it('returns null for a token signed with a different secret', () => {
    const otherManager = new SessionManager({ secret: 'other-secret' });
    const session = otherManager.createSession('user-1');
    expect(manager.verifyAccessToken(session.accessToken)).toBeNull();
  });

  it('returns null for an expired token', () => {
    const shortLived = new SessionManager({
      secret: 'test-secret-key-for-jwt',
      accessTokenTTLSeconds: -1, // already expired
    });
    const session = shortLived.createSession('user-1');
    expect(shortLived.verifyAccessToken(session.accessToken)).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(manager.verifyAccessToken('not.a.jwt')).toBeNull();
    expect(manager.verifyAccessToken('')).toBeNull();
    expect(manager.verifyAccessToken('onlyone')).toBeNull();
  });

  // ── Refresh token rotation ──────────────────────────────────

  it('refreshes a session and issues new tokens', () => {
    const original = manager.createSession('user-1');
    const refreshed = manager.refreshSession(original.refreshToken);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.accessToken).not.toBe(original.accessToken);
    expect(refreshed!.refreshToken).not.toBe(original.refreshToken);
  });

  it('invalidates old refresh token after use (one-time use)', () => {
    const original = manager.createSession('user-1');
    const first = manager.refreshSession(original.refreshToken);
    expect(first).not.toBeNull();

    // Second use of same token should fail (reuse detection)
    const second = manager.refreshSession(original.refreshToken);
    expect(second).toBeNull();
  });

  it('revokes all sessions on refresh token reuse (security)', () => {
    const s1 = manager.createSession('user-1');
    const s2 = manager.createSession('user-1');

    // Use s1 refresh token
    manager.refreshSession(s1.refreshToken);

    // Reuse s1 refresh token -- triggers revoke all for user-1
    manager.refreshSession(s1.refreshToken);

    // s2 refresh token should now be revoked too
    const result = manager.refreshSession(s2.refreshToken);
    expect(result).toBeNull();
  });

  // ── Revocation ──────────────────────────────────────────────

  it('revokes a single session by refresh token', () => {
    const session = manager.createSession('user-1');
    manager.revokeSession(session.refreshToken);
    expect(manager.refreshSession(session.refreshToken)).toBeNull();
  });

  it('revokes all sessions for a user', () => {
    const s1 = manager.createSession('user-1');
    const s2 = manager.createSession('user-1');
    const s3 = manager.createSession('user-2');

    manager.revokeAllSessions('user-1');

    expect(manager.refreshSession(s1.refreshToken)).toBeNull();
    expect(manager.refreshSession(s2.refreshToken)).toBeNull();
    // user-2 should not be affected
    expect(manager.refreshSession(s3.refreshToken)).not.toBeNull();
  });

  it('returns null when refreshing a non-existent token', () => {
    expect(manager.refreshSession('non-existent-token')).toBeNull();
  });
});
