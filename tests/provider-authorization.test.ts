import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/index.js';
import { SpotifyAuth } from '../src/spotify/auth.js';
import { ProviderInitiations } from '../src/mcp/provider-authorization.js';
import type { Server } from 'node:http';

let server: Server;
let base: string;
let stored: any;
let auth: SpotifyAuth;
const canary = 'PROVIDER_SECRET_CANARY';
let logs: string[];
const nativeFetch = globalThis.fetch;
beforeEach(async () => {
  logs = [];
  stored = { accessToken: 'previous', refreshToken: 'previous-refresh', expiresAt: 1 };
  auth = new SpotifyAuth(
    {
      SPOTIFY_CLIENT_ID: 'fixture-id',
      SPOTIFY_CLIENT_SECRET: canary,
      SPOTIFY_REDIRECT_URI: 'http://localhost/callback',
    },
    {
      load: async () => stored,
      save: async (v) => {
        stored = v;
      },
      clear: async () => {
        stored = null;
      },
    },
  );
  const app = createApp(
    {
      PUBLIC_BASE_URL: 'http://localhost',
      PORT: 0,
      HOST: '127.0.0.1',
      LOG_LEVEL: 'silent',
      MCP_AUTH_MODE: 'none',
      TRUST_PROXY: 'false',
      MCP_OAUTH_OWNER_SECRET: 'owner-fixture',
      MCP_OAUTH_STORE_PATH: '/tmp/unused-provider-auth-oauth.json',
      MCP_OAUTH_CLIENTS_PATH: '/tmp/unused-provider-auth-clients.json',
      SPOTIFY_CLIENT_ID: 'fixture-id',
      SPOTIFY_CLIENT_SECRET: canary,
      SPOTIFY_REDIRECT_URI: 'http://localhost/callback',
      SPOTIFY_MARKET: 'PL',
    } as any,
    {
      auth,
      client: { request: async () => null, json: async () => null } as any,
      logger: {
        info: (...v: any[]) => logs.push(JSON.stringify(v)),
        warn: (...v: any[]) => logs.push(JSON.stringify(v)),
      } as any,
    },
  );
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).startsWith('https://accounts.spotify.com/api/token'))
      return new Response(
        JSON.stringify({ access_token: canary, refresh_token: 'fresh-refresh', expires_in: 3600 }),
        { status: 200 },
      );
    return nativeFetch(input, init);
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
async function login() {
  const get = await fetch(base + '/owner/login');
  const loginCookie = get.headers.get('set-cookie')!.split(';')[0];
  const html = await get.text();
  const nonce = html.match(/name="csrf_token" value="([^"]+)"/)![1];
  const res = await fetch(base + '/owner/login', {
    method: 'POST',
    headers: { cookie: loginCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ owner_secret: 'owner-fixture', csrf_token: nonce }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  const consent = await fetch(base + '/auth/providers/spotify/start', { headers: { cookie } });
  const page = await consent.text();
  const csrf = page.match(/name="csrf_token" value="([^"]+)"/)![1];
  return { cookie, csrf };
}
async function approve() {
  const session = await login();
  const r = await fetch(base + '/auth/providers/spotify/start', {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: session.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf_token: session.csrf, connection_id: 'spotify-default' }),
  });
  expect(r.status).toBe(302);
  return { ...session, state: new URL(r.headers.get('location')!).searchParams.get('state')! };
}
const callback = (state: string, cookie?: string) =>
  fetch(base + `/auth/providers/spotify/callback?state=${state}&code=fixture`, {
    headers: cookie ? { cookie } : {},
  });
describe('provider owner authorization boundary', () => {
  it('rejects anonymous initiation on canonical and legacy routes', async () => {
    for (const p of ['/auth/providers/spotify/start', '/auth/spotify/login'])
      expect((await fetch(base + p)).status).toBe(401);
  });
  it('requires login CSRF and explicit replacement consent', async () => {
    expect(
      (
        await fetch(base + '/owner/login', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'owner_secret=owner-fixture',
        })
      ).status,
    ).toBe(403);
    const { cookie } = await login();
    expect(
      (await fetch(base + '/auth/providers/spotify/start', { method: 'POST', headers: { cookie } }))
        .status,
    ).toBe(403);
    expect(stored.accessToken).toBe('previous');
  });
  it('completes an approved replacement without leaking provider tokens', async () => {
    const a = await approve();
    const r = await callback(a.state, a.cookie);
    expect(r.status).toBe(200);
    expect(stored.accessToken).toBe(canary);
    expect(await r.text()).not.toContain(canary);
    expect(logs.join('')).not.toContain(canary);
  });
  it('rejects invalid state and preserves credentials', async () => {
    const a = await approve();
    expect((await callback('invalid', a.cookie)).status).toBe(400);
    expect(stored.accessToken).toBe('previous');
  });
  it('rejects expired authorized initiations', async () => {
    const a = await approve();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 601_000);
    expect((await callback(a.state, a.cookie)).status).toBe(400);
    expect(stored.accessToken).toBe('previous');
  });
  it('consumes callback authorization before the external exchange', async () => {
    const a = await approve();
    expect((await callback(a.state, a.cookie)).status).toBe(200);
    expect((await callback(a.state, a.cookie)).status).toBe(400);
  });
  it('rejects a provider-valid state without owner initiation', async () => {
    const { cookie } = await login();
    const unapproved = auth.loginUrl();
    expect((await callback(unapproved.state, cookie)).status).toBe(400);
    expect(stored.accessToken).toBe('previous');
  });
  it('binds attempts to session, provider and connection and rejects replay', () => {
    const records = new ProviderInitiations();
    records.approve('s', 'youtube', 'youtube-default', 'owner');
    expect(() => records.consume('s', 'spotify', 'spotify-default', 'owner')).toThrow();
    expect(() => records.consume('s', 'youtube', 'youtube-default', 'other')).toThrow();
    records.consume('s', 'youtube', 'youtube-default', 'owner');
    expect(() => records.consume('s', 'youtube', 'youtube-default', 'owner')).toThrow();
  });
  it('preserves old credentials on failed exchange and consumes attempt', async () => {
    const a = await approve();
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) =>
      String(input).startsWith('https://accounts.spotify.com/api/token')
        ? new Response('{}', { status: 400 })
        : nativeFetch(input, init),
    );
    expect((await callback(a.state, a.cookie)).status).toBe(400);
    expect(stored.accessToken).toBe('previous');
    expect((await callback(a.state, a.cookie)).status).toBe(400);
  });
  it('invalidates owner sessions on logout, protects CSRF and bounds login attempts', async () => {
    const a = await approve();
    expect(
      (await fetch(base + '/owner/logout', { method: 'POST', headers: { cookie: a.cookie } }))
        .status,
    ).toBe(403);
    expect(
      (
        await fetch(base + '/owner/logout', {
          method: 'POST',
          headers: { cookie: a.cookie, 'x-csrf-token': a.csrf },
        })
      ).status,
    ).toBe(204);
    expect((await callback(a.state, a.cookie)).status).toBe(400);
    for (let n = 0; n < 12; n++) await fetch(base + '/owner/login', { method: 'POST' });
    expect((await fetch(base + '/owner/login', { method: 'POST' })).status).toBe(429);
  });
  it('removes every admin page and exposes minimal public health', async () => {
    for (const path of [
      '/admin',
      '/admin/login',
      '/admin/jobs',
      '/admin/backups',
      '/connections',
      '/owner/grants',
      '/providers',
    ])
      expect((await fetch(base + path, { redirect: 'manual' })).status).toBe(404);
    const health = await (await fetch(base + '/health')).json();
    expect(Object.keys(health).sort()).toEqual(['database', 'status', 'version']);
  });
});
