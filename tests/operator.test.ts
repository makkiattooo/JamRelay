import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runOperator } from '../src/operator.js';
import { initializeDatabase, closeDatabase } from '../src/db/database.js';
import { createJob, getJob } from '../src/db/jobs.js';
import { McpOAuthStore } from '../src/mcp/oauth.js';
import { EncryptedCredentialStore } from '../src/providers/credential-store.js';
let root: string;
let lines: string[];
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'jamrelay-operator-'));
  lines = [];
  vi.stubEnv('JAMRELAY_DATA_DIR', root);
  vi.stubEnv('JAMRELAY_DB_PATH', join(root, 'jamrelay.db'));
  vi.stubEnv('MCP_OAUTH_STORE_PATH', join(root, 'oauth.json'));
  vi.stubEnv('MCP_OAUTH_CLIENTS_PATH', join(root, 'clients.json'));
  vi.stubEnv('PROVIDER_CREDENTIAL_STORE_PATH', join(root, 'credentials.json'));
  vi.stubEnv('TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 1).toString('base64'));
});
afterEach(async () => {
  closeDatabase();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});
const run = (...args: string[]) => runOperator(args, (s) => lines.push(s));
describe('local operator CLI', () => {
  it('reports status, validates usage and closes database', async () => {
    expect(await run('status', '--json')).toBe(0);
    const database = JSON.parse(lines.pop()!).database;
    expect(database.currentVersion).toBe(database.expectedVersion);
    expect(database.schemaState).toBe('current');
    expect(await run('unknown')).toBe(2);
    expect(await run('jobs', 'inspect', '999')).toBe(1);
  });
  it('lists only connection metadata without credential values', async () => {
    await new EncryptedCredentialStore(process.env.PROVIDER_CREDENTIAL_STORE_PATH!).save(
      'youtube-default',
      { accessToken: 'SECRET_CANARY' },
    );
    expect(await run('connections', 'list')).toBe(0);
    expect(lines.join('')).toContain('youtube-default');
    expect(lines.join('')).not.toContain('SECRET_CANARY');
  });
  it('inspects, cancels and refuses resurrection or unsafe resume', async () => {
    initializeDatabase();
    const id = createJob('bulk_add_tracks', {}, [{}]);
    closeDatabase();
    expect(await run('jobs', 'inspect', String(id))).toBe(0);
    expect(await run('jobs', 'cancel', String(id))).toBe(0);
    expect(await run('jobs', 'resume', String(id))).toBe(1);
    initializeDatabase();
    expect(getJob(id).status).toBe('cancelled');
  });
  it('revokes an existing cached MCP OAuth client immediately', async () => {
    initializeDatabase();
    const store = new McpOAuthStore(process.env.MCP_OAUTH_STORE_PATH!);
    await store.setGrant('client', ['spotify-default'], ['playlist.write']);
    const tokens = await store.issueTokens('client', 'http://localhost/mcp');
    expect(await store.accessPolicy(tokens.access, 'http://localhost/mcp')).toBeDefined();
    closeDatabase();
    expect(
      await run(
        'clients',
        'permissions',
        'set',
        'client',
        '--permissions',
        'playlist.read',
        '--tools',
        'get_my_playlists',
      ),
    ).toBe(0);
    expect(await store.accessPolicy(tokens.access, 'http://localhost/mcp')).toMatchObject({
      permissions: ['playlist.read'],
      tools: ['get_my_playlists'],
    });
    expect(await run('clients', 'permissions', 'client')).toBe(0);
    expect(await run('clients', 'revoke', 'client')).toBe(0);
    initializeDatabase();
    expect(await store.accessPolicy(tokens.access, 'http://localhost/mcp')).toBeUndefined();
    expect(
      await store.useRefresh(tokens.refresh, 'client', 'http://localhost/mcp'),
    ).toBeUndefined();
    await store.setGrant('client', ['spotify-default'], ['playlist.write']);
    const fresh = await store.issueTokens('client', 'http://localhost/mcp');
    expect(await store.accessPolicy(fresh.access, 'http://localhost/mcp')).toBeDefined();
    expect(await store.accessPolicy(tokens.access, 'http://localhost/mcp')).toBeUndefined();
  });
  it('creates and lists a usable backup with no encryption keys in output', async () => {
    expect(await run('status')).toBe(0);
    expect(await run('backup', 'create')).toBe(0);
    expect(await run('backup', 'list')).toBe(0);
    expect(JSON.parse(lines.pop()!)[0].valid).toBe(true);
    expect(lines.join('')).not.toContain(process.env.TOKEN_ENCRYPTION_KEY);
  });
});
