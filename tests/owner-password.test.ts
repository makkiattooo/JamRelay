import { afterEach, expect, it } from 'vitest';
import express from 'express';
import {
  hashOwnerPassword,
  ownerCredentialMatches,
  passwordProblem,
  verifyOwnerPassword,
} from '../src/mcp/owner-password.js';
import { registerOwnerAuthentication } from '../src/mcp/provider-authorization.js';
import { renderAuthorizePage } from '../src/mcp/oauth-authorize-page.js';
import type { Server } from 'node:http';
let server: Server | undefined;
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  }
});
it('salts password hashes, rejects weak/invalid values, and keeps recovery explicitly separate', async () => {
  const password = 'a unique owner passphrase 2026';
  const first = await hashOwnerPassword(password),
    second = await hashOwnerPassword(password);
  expect(first).not.toBe(second);
  expect(first).not.toContain(password);
  expect(passwordProblem('aaaaaaaaaaaa')).toBeTruthy();
  expect(await verifyOwnerPassword(password, first)).toBe(true);
  expect(await verifyOwnerPassword('incorrect password', first)).toBe(false);
  expect(await verifyOwnerPassword(password, first.replace('131072', '999999999'))).toBe(false);
  expect(await ownerCredentialMatches({ owner_secret: 'legacy' }, 'legacy', first)).toBe(true);
  expect(
    await ownerCredentialMatches(
      { owner_password: 'wrong password', owner_secret: 'legacy' },
      'legacy',
      first,
    ),
  ).toBe(false);
});
it('requires CSRF, authenticates password into a protected session and rate limits attempts', async () => {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  registerOwnerAuthentication(
    app,
    'legacy-recovery',
    'http://127.0.0.1',
    await hashOwnerPassword('my long unique passphrase'),
  );
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server!.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const page = await fetch(base + '/owner/login'),
    html = await page.text();
  const cookie = page.headers.get('set-cookie')!.split(';')[0];
  const csrf = html.match(/name="csrf_token" value="([^"]+)"/)![1];
  const post = (values: Record<string, string>) =>
    fetch(base + '/owner/login', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values),
    });
  expect((await post({ owner_password: 'my long unique passphrase' })).status).toBe(403);
  const login = await post({ csrf_token: csrf, owner_password: 'my long unique passphrase' });
  expect(login.status).toBe(200);
  expect(login.headers.get('set-cookie')).toContain('HttpOnly');
  expect(login.headers.get('set-cookie')).toContain('SameSite=Lax');
  expect(await login.text()).not.toContain('legacy-recovery');
  for (let i = 0; i < 8; i++) await post({ csrf_token: csrf, owner_secret: 'wrong' });
  expect((await post({ csrf_token: csrf, owner_secret: 'wrong' })).status).toBe(429);
});
it('defaults to read access, escapes client metadata and keeps sensitive grants opt-in', () => {
  const html = renderAuthorizePage({
    clientName: '<img src=x onerror=alert(1)>Claude Code',
    fields: {},
    hasPassword: true,
    permissions: [
      'playlist.read',
      'playlist.write',
      'playlist.destructive',
      'transfer.execute',
      'playback.control',
      'library.write',
    ],
  });
  expect(html).toContain('Connect an AI client to JamRelay');
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<img src=x');
  expect(html).toContain('value="playlist.read" checked');
  for (const scope of [
    'playlist.write',
    'playlist.destructive',
    'transfer.execute',
    'playback.control',
    'library.write',
  ])
    expect(html).not.toContain(`value="${scope}" checked`);
  expect(html).toContain('name="owner_password"');
});
