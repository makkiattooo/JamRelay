import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';

const zeroProviderConfig = {
  PUBLIC_BASE_URL: 'http://127.0.0.1:5267',
  PORT: 0,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'silent',
  MCP_AUTH_MODE: 'none',
  TRUST_PROXY: 'false',
  MCP_OAUTH_STORE_PATH: './data/unused-mcp-oauth.json',
  MCP_OAUTH_CLIENTS_PATH: './data/unused-mcp-clients.json',
  SPOTIFY_MARKET: 'PL',
} as any;

let server: any;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  server = undefined;
});

describe('provider-neutral bootstrap', () => {
  it('boots with zero providers and exposes compatible health/auth status', async () => {
    const app = createApp(zeroProviderConfig);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const health = await fetch(base + '/health');
    const healthBody: any = await health.json();
    expect(healthBody.providers).toEqual([]);
    expect(healthBody.spotifyConnected).toBe(false);
    expect(healthBody.version).toBe('1.1.0');
    const status: any = await (await fetch(base + '/auth/status')).json();
    expect(status.providers).toEqual([]);
    expect(status.spotifyConnected).toBe(false);
    const login = await fetch(base + '/auth/providers/spotify/start');
    expect(login.status).toBe(503);
    expect((await login.json()).error.code).toBe('PROVIDER_NOT_CONFIGURED');
    for (const path of [
      '/admin',
      '/admin/connections',
      '/admin/providers',
      '/admin/clients',
      '/admin/status',
    ]) {
      const response = await fetch(base + path, { redirect: 'manual' });
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/admin/login');
    }
  });

  it('registers Spotify when the configuration group is complete and exposes provider onboarding', async () => {
    const app = createApp(
      {
        ...zeroProviderConfig,
        SPOTIFY_CLIENT_ID: 'id',
        SPOTIFY_CLIENT_SECRET: 'secret',
        SPOTIFY_REDIRECT_URI: 'https://example.com/callback',
        TOKEN_ENCRYPTION_KEY: 'unused-injected-auth',
      },
      {
        auth: {
          connected: async () => true,
          loginUrl: () => ({ url: 'https://accounts.spotify.com/authorize?state=test' }),
        } as any,
        client: { request: async () => null, json: async () => null } as any,
        logger: { info() {}, warn() {} } as any,
      },
    );
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const providers: any = await (await fetch(base + '/providers')).json();
    expect(providers.providers).toHaveLength(1);
    expect(providers.providers[0]).toMatchObject({
      provider: 'spotify',
      connectionId: 'spotify-default',
    });
    const login = await fetch(base + '/auth/providers/spotify/start', { redirect: 'manual' });
    expect(login.status).toBe(302);
    expect(login.headers.get('location')).toContain('accounts.spotify.com/authorize');
    const legacyLogin = await fetch(base + '/auth/spotify/login', { redirect: 'manual' });
    expect(legacyLogin.status).toBe(302);
    expect(legacyLogin.headers.get('location')).toContain('accounts.spotify.com/authorize');
    const canonicalCallback = await fetch(
      base + '/auth/providers/spotify/callback?error=access_denied',
    );
    const legacyCallback = await fetch(base + '/auth/spotify/callback?error=access_denied');
    expect(canonicalCallback.status).toBe(400);
    expect(legacyCallback.status).toBe(400);
    expect(await canonicalCallback.text()).toContain('Authorization failed');
    expect(await legacyCallback.text()).toContain('Authorization failed');
  });
});
