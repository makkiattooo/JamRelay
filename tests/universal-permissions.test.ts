import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { createApp } from '../src/index.js';
import { initializeDatabase, closeDatabase } from '../src/db/database.js';
import { McpOAuthStore } from '../src/mcp/oauth.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { toolContext } from '../src/mcp/context.js';
import { McpPermissionEngine } from '../src/mcp/permissions.js';
import { JobRunner } from '../src/db/job-runner.js';
import { createJob, getJob } from '../src/db/jobs.js';

let directory: string;
let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  closeDatabase();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const decode = async (response: Response) => {
  const raw = await response.text();
  return JSON.parse(
    raw.startsWith('event:')
      ? raw
          .split('\n')
          .find((line) => line.startsWith('data:'))!
          .slice(5)
      : raw,
  );
};

it('enforces isolated, live owner grants and filtered discovery through actual OAuth HTTP requests', async () => {
  directory = await mkdtemp(join(tmpdir(), 'jamrelay-policy-'));
  initializeDatabase({ dataDir: directory });
  const path = join(directory, 'oauth.json');
  const registry = new ProviderRegistry();
  let writes = 0;
  for (const id of ['account-a', 'account-b'])
    registry.register({
      summary: {
        connectionId: id,
        provider: 'fixture',
        connected: true,
        capabilities: { catalog: true, playlistRead: true, playlistWrite: true },
      },
      catalog: { searchTracks: async () => [], getTrack: async () => null },
      playlistWrite: {
        createPlaylist: async () => {
          writes++;
          return { id: 'created' };
        },
      } as any,
    });
  const cfg: any = {
    PUBLIC_BASE_URL: 'http://127.0.0.1',
    LOG_LEVEL: 'silent',
    TRUST_PROXY: 'false',
    MCP_OAUTH_OWNER_SECRET: 'fixture-owner-secret',
    MCP_OAUTH_DCR_ENABLED: 'true',
    MCP_OAUTH_STORE_PATH: path,
    MCP_OAUTH_CLIENTS_PATH: join(directory, 'clients.json'),
    JAMRELAY_TOOLSET: 'all',
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    PROVIDER_CREDENTIAL_STORE_PATH: join(directory, 'credentials.json'),
  };
  server = createApp(cfg, { registry }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const root = `http://127.0.0.1:${(server.address() as any).port}`;
  const form = (url: string, body: URLSearchParams) =>
    fetch(root + url, { method: 'POST', body, redirect: 'manual' });
  const login = async (account: string) => {
    const client = await (
      await fetch(root + '/oauth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Identical untrusted model name',
          redirect_uris: ['http://127.0.0.1:14567/callback'],
          token_endpoint_auth_method: 'none',
          application_type: 'native',
        }),
      })
    ).json();
    const verifier = randomBytes(32).toString('base64url');
    const fields = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: 'http://127.0.0.1:14567/callback',
      response_type: 'code',
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      state: 'fixture-state',
      resource: 'http://127.0.0.1/mcp',
      owner_secret: 'fixture-owner-secret',
      connection_ids: account,
      permissions: 'catalog.read',
    });
    const bad = new URLSearchParams(fields);
    bad.set('redirect_uri', 'https://untrusted.example/callback');
    expect((await form('/oauth/authorize', bad)).status).toBe(400);
    const denial = new URLSearchParams(fields);
    denial.set('decision', 'cancel');
    const denied = await form('/oauth/authorize', denial);
    expect(new URL(denied.headers.get('location')!).searchParams.get('error')).toBe(
      'access_denied',
    );
    expect(new URL(denied.headers.get('location')!).searchParams.get('state')).toBe(
      'fixture-state',
    );
    const approved = await form('/oauth/authorize', fields);
    expect(approved.status).toBe(302);
    const callback = new URL(approved.headers.get('location')!);
    expect(callback.origin + callback.pathname).toBe('http://127.0.0.1:14567/callback');
    const tokenFields = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      redirect_uri: fields.get('redirect_uri')!,
      code: callback.searchParams.get('code')!,
      code_verifier: verifier,
      resource: 'http://127.0.0.1/mcp',
    });
    const mismatch = new URLSearchParams(tokenFields);
    mismatch.set('code_verifier', randomBytes(32).toString('base64url'));
    expect((await form('/oauth/token', mismatch)).status).toBe(400);
    const tokens = await (await form('/oauth/token', tokenFields)).json();
    expect(tokens.access_token).toBeTruthy();
    return { id: client.client_id, token: tokens.access_token };
  };
  const a = await login('account-a');
  const b = await login('account-b');
  const rpc = async (client: typeof a, method: string, params: unknown = {}) => {
    const response = await fetch(root + '/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${client.token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    return { status: response.status, body: await decode(response) };
  };
  const names = async (client: typeof a) =>
    (await rpc(client, 'tools/list')).body.result.tools.map((t: any) => t.name);
  expect(await names(a)).toContain('search_tracks');
  expect(await names(a)).not.toContain('create_playlist');
  expect(
    (
      await rpc(a, 'tools/call', {
        name: 'create_playlist',
        arguments: { name: 'denied', connection_id: 'account-a' },
      })
    ).body.result.isError,
  ).toBe(true);
  expect(
    (
      await rpc(a, 'tools/call', {
        name: 'search_tracks',
        arguments: { query: 'test', connection_id: 'account-b' },
      })
    ).body.result.isError,
  ).toBe(true);
  // A separate store represents a separately running owner CLI; no cached server grant may survive it.
  const owner = new McpOAuthStore(path);
  await owner.updateGrant(a.id, ['account-a'], ['catalog.read', 'playlist.write']);
  expect(await names(a)).toContain('create_playlist');
  expect(await names(b)).not.toContain('create_playlist');
  expect(
    (
      await rpc(a, 'tools/call', {
        name: 'create_playlist',
        arguments: { name: 'allowed', connection_id: 'account-a' },
      })
    ).body.result.isError,
  ).not.toBe(true);
  expect(writes).toBe(1);
  await owner.updateGrant(a.id, ['account-a'], ['catalog.read'], ['get_track']);
  expect(await names(a)).toEqual(['get_track']);
  expect(
    (
      await rpc(a, 'tools/call', {
        name: 'create_playlist',
        arguments: { name: 'revoked', connection_id: 'account-a' },
      })
    ).body.result.isError,
  ).toBe(true);
  await owner.revokeGrant(a.id);
  expect((await rpc(a, 'tools/list')).status).toBe(401);
  expect((await rpc(b, 'tools/list')).status).toBe(200);
  expect(writes).toBe(1);
});

it('rechecks a changed grant during a running operation and before durable work', async () => {
  directory = await mkdtemp(join(tmpdir(), 'jamrelay-job-policy-'));
  initializeDatabase({ dataDir: directory });
  const store = new McpOAuthStore(join(directory, 'oauth.json'));
  await store.setGrant('a', ['account-a'], ['playlist.write']);
  const access = (await store.policyFor('a'))!;
  const context = {
    requestId: 'job-test',
    signal: new AbortController().signal,
    deadlineAt: Date.now() + 5000,
    mcpAccess: access,
    operation: 'create_bulk_job',
    resolveAccess: () => store.policyFor('a'),
  };
  const id = await toolContext.run(context, async () =>
    createJob('bulk_add_tracks', { provider: 'fixture', connection_id: 'account-a' }, [
      { title: 'test', artist: 'fixture' },
    ]),
  );
  await toolContext.run(context, async () => {
    await McpPermissionEngine.enforceWrite(['account-a']);
    await new McpOAuthStore(join(directory, 'oauth.json')).updateGrant(
      'a',
      ['account-a'],
      ['playlist.read'],
    );
    await expect(McpPermissionEngine.enforceWrite(['account-a'])).rejects.toThrow(
      'PERMISSION_NOT_GRANTED',
    );
  });
  let called = false;
  const runner = new JobRunner(
    {
      resolve: async () => {
        called = true;
        return { status: 'matched' };
      },
    },
    undefined,
    store,
  );
  runner.start();
  try {
    for (let i = 0; i < 100 && getJob(id).status !== 'failed'; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(getJob(id).lastErrorCode).toBe('PERMISSION_NOT_GRANTED');
    expect(called).toBe(false);
  } finally {
    await runner.stop();
  }
});
