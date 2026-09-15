import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

const config = {
  PUBLIC_BASE_URL: 'http://127.0.0.1:5267',
  PORT: 0,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'silent',
  MCP_AUTH_MODE: 'none',
  MCP_OAUTH_OWNER_SECRET: 'SHOULD_NEVER_RENDER_OWNER_SECRET',
  MCP_OAUTH_STORE_PATH: './data/admin-routes-oauth.json',
  MCP_OAUTH_CLIENTS_PATH: './data/admin-routes-clients.json',
  PROVIDER_CREDENTIAL_STORE_PATH: './data/admin-routes-credentials.json',
  JAMRELAY_DATA_DIR: './data',
  JAMRELAY_DB_PATH: './data/admin-routes.db',
  SPOTIFY_MARKET: 'PL',
  JAMRELAY_TOOLSET: 'all',
} as any;

let server: any;
let runtimeRoot = '';
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  server = undefined;
  if (runtimeRoot) await rm(runtimeRoot, { recursive: true, force: true });
  runtimeRoot = '';
});

describe('Admin Console routes', () => {
  it('protects pages, exposes the operational surface, and enforces CSRF', async () => {
    runtimeRoot = await mkdtemp(join(process.cwd(), 'tmp-admin-routes-'));
    const app = createApp(
      {
        ...config,
        JAMRELAY_DATA_DIR: runtimeRoot,
        JAMRELAY_DB_PATH: join(runtimeRoot, 'admin-routes.db'),
        MCP_OAUTH_STORE_PATH: join(runtimeRoot, 'oauth.json'),
        MCP_OAUTH_CLIENTS_PATH: join(runtimeRoot, 'clients.json'),
        PROVIDER_CREDENTIAL_STORE_PATH: join(runtimeRoot, 'credentials.json'),
      },
      { logger: { info() {}, warn() {} } as any },
    );
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    const unauthenticated = await fetch(`${base}/admin`, { redirect: 'manual' });
    expect(unauthenticated.status).toBe(302);
    expect(unauthenticated.headers.get('location')).toBe('/admin/login');

    const login = await fetch(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'owner_secret=SHOULD_NEVER_RENDER_OWNER_SECRET',
      redirect: 'manual',
    });
    expect(login.status).toBe(302);
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    expect(cookie).toMatch(/^jamrelay_owner=/);

    for (const route of [
      '/admin',
      '/admin/connections',
      '/admin/providers',
      '/admin/clients',
      '/admin/jobs',
      '/admin/diagnostics',
      '/admin/tools',
      '/admin/status',
      '/admin/backups',
    ]) {
      const response = await fetch(`${base}${route}`, { headers: { cookie: cookie! } });
      const html = await response.text();
      expect(response.status, `${route}: ${html}`).toBe(200);
      expect(html, route).toContain('/assets/admin/admin.css');
      expect(html, route).not.toContain('SHOULD_NEVER_RENDER_OWNER_SECRET');
    }

    const backups = await fetch(`${base}/admin/backups`, { headers: { cookie: cookie! } });
    expect(await backups.text()).toContain('/admin/backups/create');
    const csrfFailure = await fetch(`${base}/admin/backups/create`, {
      method: 'POST',
      headers: {
        cookie: cookie!,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'csrf_token=wrong',
    });
    expect(csrfFailure.status).toBe(403);
  });
});
