import { describe, it, expect, beforeEach } from 'vitest';
import { OAuthHandler, InMemoryOAuthUserStore } from '../auth/oauth-handler.js';
import type { FetchFn } from '../auth/oauth-handler.js';
import type { OAuthProvider, OAuthProviderConfig } from '../types.js';

// ── Test fixtures ───────────────────────────────────────────────

const TEST_CONFIGS: Record<OAuthProvider, OAuthProviderConfig> = {
  google: {
    clientId: 'google-client-id',
    clientSecret: 'google-secret',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['openid', 'email', 'profile'],
    redirectUri: 'http://localhost:3000/auth/callback',
  },
  github: {
    clientId: 'github-client-id',
    clientSecret: 'github-secret',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
    redirectUri: 'http://localhost:3000/auth/callback',
  },
  discord: {
    clientId: 'discord-client-id',
    clientSecret: 'discord-secret',
    authorizationUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userInfoUrl: 'https://discord.com/api/users/@me',
    scopes: ['identify', 'email'],
    redirectUri: 'http://localhost:3000/auth/callback',
  },
};

function createMockFetch(
  tokenResponse: Record<string, unknown>,
  userResponse: Record<string, unknown>,
): FetchFn {
  let callCount = 0;
  return async (_url: string, _init?: RequestInit) => {
    callCount++;
    if (callCount === 1) {
      // Token endpoint
      return new Response(JSON.stringify(tokenResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // User info endpoint
    return new Response(JSON.stringify(userResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

function createFailingFetch(status: number, body: string): FetchFn {
  return async () =>
    new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });
}

// ── Tests ───────────────────────────────────────────────────────

describe('OAuthHandler', () => {
  let handler: OAuthHandler;
  let store: InMemoryOAuthUserStore;

  beforeEach(() => {
    store = new InMemoryOAuthUserStore();
    handler = new OAuthHandler({
      store,
      configs: TEST_CONFIGS,
      fetchFn: createMockFetch(
        { access_token: 'at_123', refresh_token: 'rt_456', expires_in: 3600 },
        { id: 'u1', email: 'test@example.com', name: 'Test User' },
      ),
    });
  });

  // ── PKCE ────────────────────────────────────────────────────

  it('generates PKCE code verifier and challenge', () => {
    const pkce = handler.generatePKCE();
    expect(pkce.codeVerifier).toBeDefined();
    expect(pkce.codeChallenge).toBeDefined();
    expect(pkce.codeVerifier).not.toEqual(pkce.codeChallenge);
    expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(32);
  });

  it('generates unique PKCE pairs each time', () => {
    const a = handler.generatePKCE();
    const b = handler.generatePKCE();
    expect(a.codeVerifier).not.toEqual(b.codeVerifier);
    expect(a.codeChallenge).not.toEqual(b.codeChallenge);
  });

  // ── Authorization URLs ──────────────────────────────────────

  it('generates Google authorization URL with correct params', () => {
    const url = handler.getAuthorizationUrl('google', 'state123', 'verifier');
    expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=google-client-id');
    expect(url).toContain('response_type=code');
    expect(url).toContain('state=state123');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('scope=openid+email+profile');
  });

  it('generates GitHub authorization URL with correct params', () => {
    const url = handler.getAuthorizationUrl('github', 'gh_state', 'verifier');
    expect(url).toContain('github.com/login/oauth/authorize');
    expect(url).toContain('client_id=github-client-id');
    expect(url).toContain('scope=read%3Auser+user%3Aemail');
  });

  it('generates Discord authorization URL with correct params', () => {
    const url = handler.getAuthorizationUrl('discord', 'dc_state', 'verifier');
    expect(url).toContain('discord.com/api/oauth2/authorize');
    expect(url).toContain('client_id=discord-client-id');
    expect(url).toContain('scope=identify+email');
  });

  it('includes code_challenge derived from verifier', () => {
    const url = handler.getAuthorizationUrl('google', 's', 'my_verifier');
    expect(url).toContain('code_challenge=');
    expect(url).toContain('code_challenge_method=S256');
  });

  // ── Code exchange ───────────────────────────────────────────

  it('exchanges authorization code for a session', async () => {
    const session = await handler.exchangeCode('google', 'auth_code', 'verifier');
    expect(session.accessToken).toBe('at_123');
    expect(session.refreshToken).toBe('rt_456');
    expect(session.provider).toBe('google');
    expect(session.userId).toContain('google');
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('normalizes GitHub user info (login field)', async () => {
    const mockFetch = createMockFetch(
      { access_token: 'at', refresh_token: 'rt', expires_in: 3600 },
      { id: '42', email: 'dev@gh.com', login: 'octocat', avatar_url: 'https://img' },
    );
    const h = new OAuthHandler({ store, configs: TEST_CONFIGS, fetchFn: mockFetch });
    const session = await h.exchangeCode('github', 'code', 'ver');
    expect(session.provider).toBe('github');
    // User is stored
    const user = store.getUser(session.userId);
    expect(user).not.toBeNull();
    expect(user?.name).toBe('octocat');
  });

  it('normalizes Discord user info (username field)', async () => {
    const mockFetch = createMockFetch(
      { access_token: 'at', expires_in: 3600 },
      { id: '99', email: 'user@discord.com', username: 'discordian', avatar: 'abc' },
    );
    const h = new OAuthHandler({ store, configs: TEST_CONFIGS, fetchFn: mockFetch });
    const session = await h.exchangeCode('discord', 'code', 'ver');
    expect(session.provider).toBe('discord');
    expect(session.refreshToken).toBe(''); // no refresh token from discord mock
  });

  it('throws on failed token exchange', async () => {
    const h = new OAuthHandler({
      store,
      configs: TEST_CONFIGS,
      fetchFn: createFailingFetch(400, 'invalid_grant'),
    });
    await expect(h.exchangeCode('google', 'bad', 'ver')).rejects.toThrow(
      'Token exchange failed',
    );
  });

  // ── Token refresh ───────────────────────────────────────────

  it('refreshes an access token', async () => {
    const refreshFetch: FetchFn = async () =>
      new Response(
        JSON.stringify({ access_token: 'new_at', refresh_token: 'new_rt', expires_in: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const h = new OAuthHandler({ store, configs: TEST_CONFIGS, fetchFn: refreshFetch });
    const session = await h.refreshAccessToken('old_rt', 'google');
    expect(session.accessToken).toBe('new_at');
    expect(session.refreshToken).toBe('new_rt');
  });

  it('throws on failed token refresh', async () => {
    const h = new OAuthHandler({
      store,
      configs: TEST_CONFIGS,
      fetchFn: createFailingFetch(401, 'invalid_token'),
    });
    await expect(h.refreshAccessToken('bad', 'google')).rejects.toThrow(
      'Token refresh failed',
    );
  });
});
