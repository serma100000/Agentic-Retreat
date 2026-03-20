/**
 * OAuth 2.0 handler with PKCE support for Google, GitHub, and Discord.
 */

import { createHash, randomBytes } from 'node:crypto';
import type {
  AuthSession,
  OAuthProvider,
  OAuthProviderConfig,
  PKCEPair,
} from '../types.js';

// ── Provider configurations ─────────────────────────────────────

function getProviderConfigs(): Record<OAuthProvider, OAuthProviderConfig> {
  return {
    google: {
      clientId: process.env['OAUTH_GOOGLE_CLIENT_ID'] ?? '',
      clientSecret: process.env['OAUTH_GOOGLE_CLIENT_SECRET'] ?? '',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
      scopes: ['openid', 'email', 'profile'],
      redirectUri: process.env['OAUTH_REDIRECT_URI'] ?? 'http://localhost:3000/auth/callback',
    },
    github: {
      clientId: process.env['OAUTH_GITHUB_CLIENT_ID'] ?? '',
      clientSecret: process.env['OAUTH_GITHUB_CLIENT_SECRET'] ?? '',
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
      scopes: ['read:user', 'user:email'],
      redirectUri: process.env['OAUTH_REDIRECT_URI'] ?? 'http://localhost:3000/auth/callback',
    },
    discord: {
      clientId: process.env['OAUTH_DISCORD_CLIENT_ID'] ?? '',
      clientSecret: process.env['OAUTH_DISCORD_CLIENT_SECRET'] ?? '',
      authorizationUrl: 'https://discord.com/api/oauth2/authorize',
      tokenUrl: 'https://discord.com/api/oauth2/token',
      userInfoUrl: 'https://discord.com/api/users/@me',
      scopes: ['identify', 'email'],
      redirectUri: process.env['OAUTH_REDIRECT_URI'] ?? 'http://localhost:3000/auth/callback',
    },
  };
}

// ── Token exchange response shapes ──────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

// ── Pluggable persistence layer ─────────────────────────────────

export interface OAuthUserStore {
  upsertUser(info: UserInfo, provider: OAuthProvider): Promise<string>;
  storeSession(session: AuthSession): Promise<void>;
}

/**
 * Default in-memory store -- swap for a real database adapter in production.
 */
export class InMemoryOAuthUserStore implements OAuthUserStore {
  private users = new Map<string, UserInfo & { provider: OAuthProvider }>();
  private sessions = new Map<string, AuthSession>();

  async upsertUser(info: UserInfo, provider: OAuthProvider): Promise<string> {
    const key = `${provider}:${info.id}`;
    this.users.set(key, { ...info, provider });
    return key;
  }

  async storeSession(session: AuthSession): Promise<void> {
    this.sessions.set(session.userId, session);
  }

  getUser(key: string) {
    return this.users.get(key) ?? null;
  }

  getSession(userId: string) {
    return this.sessions.get(userId) ?? null;
  }
}

// ── HTTP fetch helper (injectable for testing) ──────────────────

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// ── OAuthHandler ────────────────────────────────────────────────

export class OAuthHandler {
  private readonly configs: Record<OAuthProvider, OAuthProviderConfig>;
  private readonly store: OAuthUserStore;
  private readonly fetchFn: FetchFn;

  constructor(opts?: {
    store?: OAuthUserStore;
    fetchFn?: FetchFn;
    configs?: Record<OAuthProvider, OAuthProviderConfig>;
  }) {
    this.configs = opts?.configs ?? getProviderConfigs();
    this.store = opts?.store ?? new InMemoryOAuthUserStore();
    this.fetchFn = opts?.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  // ── PKCE ────────────────────────────────────────────────────

  generatePKCE(): PKCEPair {
    const codeVerifier = randomBytes(32)
      .toString('base64url')
      .slice(0, 43);

    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  // ── Authorization URL ───────────────────────────────────────

  getAuthorizationUrl(
    provider: OAuthProvider,
    state: string,
    codeVerifier: string,
  ): string {
    const config = this.configs[provider];
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${config.authorizationUrl}?${params.toString()}`;
  }

  // ── Code exchange ───────────────────────────────────────────

  async exchangeCode(
    provider: OAuthProvider,
    code: string,
    codeVerifier: string,
  ): Promise<AuthSession> {
    const config = this.configs[provider];
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    // 1. Exchange code for tokens
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: codeVerifier,
    });

    const tokenHeaders: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (provider === 'github') {
      tokenHeaders['Accept'] = 'application/json';
    }

    const tokenRes = await this.fetchFn(config.tokenUrl, {
      method: 'POST',
      headers: tokenHeaders,
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      throw new Error(`Token exchange failed: ${tokenRes.status} ${errorText}`);
    }

    const tokenData = (await tokenRes.json()) as TokenResponse;

    // 2. Fetch user info
    const userRes = await this.fetchFn(config.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      throw new Error(`User info request failed: ${userRes.status}`);
    }

    const rawUser = (await userRes.json()) as Record<string, unknown>;
    const userInfo = this.normalizeUser(rawUser, provider);

    // 3. Persist user
    const userId = await this.store.upsertUser(userInfo, provider);

    const expiresIn = tokenData.expires_in ?? 3600;
    const session: AuthSession = {
      userId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? '',
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      provider,
    };

    await this.store.storeSession(session);
    return session;
  }

  // ── Refresh token ───────────────────────────────────────────

  async refreshAccessToken(
    refreshToken: string,
    provider: OAuthProvider,
  ): Promise<AuthSession> {
    const config = this.configs[provider];
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (provider === 'github') {
      headers['Accept'] = 'application/json';
    }

    const res = await this.fetchFn(config.tokenUrl, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Token refresh failed: ${res.status} ${errorText}`);
    }

    const tokenData = (await res.json()) as TokenResponse;
    const expiresIn = tokenData.expires_in ?? 3600;

    return {
      userId: '', // caller must set from context
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      provider,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────

  private normalizeUser(
    raw: Record<string, unknown>,
    provider: OAuthProvider,
  ): UserInfo {
    switch (provider) {
      case 'google':
        return {
          id: String(raw['id'] ?? ''),
          email: String(raw['email'] ?? ''),
          name: String(raw['name'] ?? ''),
          avatar: raw['picture'] as string | undefined,
        };
      case 'github':
        return {
          id: String(raw['id'] ?? ''),
          email: String(raw['email'] ?? ''),
          name: String(raw['login'] ?? raw['name'] ?? ''),
          avatar: raw['avatar_url'] as string | undefined,
        };
      case 'discord':
        return {
          id: String(raw['id'] ?? ''),
          email: String(raw['email'] ?? ''),
          name: String(raw['username'] ?? ''),
          avatar: raw['avatar'] as string | undefined,
        };
    }
  }
}
