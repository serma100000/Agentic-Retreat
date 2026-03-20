/**
 * JWT-based session management with refresh token rotation.
 *
 * Access tokens  : HS256 JWT, 15-minute expiry
 * Refresh tokens : opaque, 7-day expiry, stored hashed, one-time use
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { OAuthProvider } from '../types.js';

// ── Types ───────────────────────────────────────────────────────

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface AccessTokenPayload {
  userId: string;
  orgId?: string;
  role?: string;
}

interface JwtHeader {
  alg: 'HS256';
  typ: 'JWT';
}

interface JwtPayload extends AccessTokenPayload {
  jti: string; // unique token ID to prevent identical JWTs
  iat: number;
  exp: number;
  provider?: OAuthProvider;
}

interface StoredRefreshToken {
  hash: string;
  userId: string;
  expiresAt: Date;
  used: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────

function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

// ── SessionManager ──────────────────────────────────────────────

export class SessionManager {
  private readonly secret: string;
  private readonly accessTokenTTL: number;  // seconds
  private readonly refreshTokenTTL: number; // seconds

  /** In-memory store. Replace with DB adapter for production. */
  private refreshTokens = new Map<string, StoredRefreshToken>();

  constructor(opts?: {
    secret?: string;
    accessTokenTTLSeconds?: number;
    refreshTokenTTLSeconds?: number;
  }) {
    this.secret = opts?.secret ?? process.env['JWT_SECRET'] ?? 'openpulse-dev-secret';
    this.accessTokenTTL = opts?.accessTokenTTLSeconds ?? 900;  // 15 min
    this.refreshTokenTTL = opts?.refreshTokenTTLSeconds ?? 604_800; // 7 days
  }

  // ── JWT Signing / Verifying ─────────────────────────────────

  private signJwt(payload: JwtPayload): string {
    const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
    const segments = [
      base64url(JSON.stringify(header)),
      base64url(JSON.stringify(payload)),
    ];
    const signingInput = segments.join('.');
    const signature = createHmac('sha256', this.secret)
      .update(signingInput)
      .digest('base64url');
    return `${signingInput}.${signature}`;
  }

  private verifyJwt(token: string): JwtPayload | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signature] = parts as [string, string, string];
    const signingInput = `${headerB64}.${payloadB64}`;
    const expected = createHmac('sha256', this.secret)
      .update(signingInput)
      .digest('base64url');

    if (signature !== expected) return null;

    try {
      const payload = JSON.parse(base64urlDecode(payloadB64)) as JwtPayload;
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // expired
      }
      return payload;
    } catch {
      return null;
    }
  }

  // ── Public API ──────────────────────────────────────────────

  createSession(
    userId: string,
    provider?: OAuthProvider,
    extra?: { orgId?: string; role?: string },
  ): SessionTokens {
    const now = Math.floor(Date.now() / 1000);

    const payload: JwtPayload = {
      jti: randomBytes(16).toString('hex'),
      userId,
      orgId: extra?.orgId,
      role: extra?.role,
      provider,
      iat: now,
      exp: now + this.accessTokenTTL,
    };

    const accessToken = this.signJwt(payload);
    const refreshToken = randomBytes(32).toString('hex');
    const refreshHash = sha256(refreshToken);

    this.refreshTokens.set(refreshHash, {
      hash: refreshHash,
      userId,
      expiresAt: new Date(Date.now() + this.refreshTokenTTL * 1000),
      used: false,
    });

    return {
      accessToken,
      refreshToken,
      expiresAt: new Date((now + this.accessTokenTTL) * 1000),
    };
  }

  verifyAccessToken(token: string): AccessTokenPayload | null {
    const payload = this.verifyJwt(token);
    if (!payload) return null;
    return {
      userId: payload.userId,
      orgId: payload.orgId,
      role: payload.role,
    };
  }

  refreshSession(refreshToken: string): SessionTokens | null {
    const hash = sha256(refreshToken);
    const stored = this.refreshTokens.get(hash);

    if (!stored) return null;
    if (stored.used) {
      // Token reuse detected -- revoke all tokens for this user (security)
      this.revokeAllSessions(stored.userId);
      return null;
    }
    if (stored.expiresAt < new Date()) {
      this.refreshTokens.delete(hash);
      return null;
    }

    // Mark old token as used
    stored.used = true;

    // Issue new session
    return this.createSession(stored.userId);
  }

  revokeSession(refreshToken: string): void {
    const hash = sha256(refreshToken);
    this.refreshTokens.delete(hash);
  }

  revokeAllSessions(userId: string): void {
    for (const [hash, entry] of this.refreshTokens) {
      if (entry.userId === userId) {
        this.refreshTokens.delete(hash);
      }
    }
  }

  // ── Test helpers ────────────────────────────────────────────

  /** Exposed for testing only. */
  _getStoredRefreshTokenCount(): number {
    return this.refreshTokens.size;
  }
}
