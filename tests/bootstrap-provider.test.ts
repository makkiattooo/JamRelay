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
    expect(healthBody.version).toBe('1.4.0');
    expect((await fetch(base + '/auth/providers/spotify/start')).status).toBe(401);
    for (const path of [
      '/admin',
      '/admin/connections',
      '/admin/providers',
      '/admin/clients',
      '/admin/status',
    ]) {
      const response = await fetch(base + path, { redirect: 'manual' });
      expect(response.status).toBe(404);
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
    expect((await fetch(base + '/auth/providers/spotify/start')).status).toBe(401);
    expect((await fetch(base + '/auth/spotify/login')).status).toBe(401);
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
