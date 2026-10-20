import { McpOAuthStore } from '../src/mcp/oauth.js';
import { APP_VERSION } from '../src/version.js';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';
import { createApp, startServer } from '../src/index.js';
import { closeDatabase, initializeDatabase, isDatabaseInitialized } from '../src/db/database.js';
import { createJob, getJob, recoverInterruptedJobs, setJobStatus } from '../src/db/jobs.js';
import { JobRunner } from '../src/db/job-runner.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { resetLifecycleForTests } from '../src/runtime/lifecycle.js';
import { runOperator } from '../src/operator.js';

// Isolated local fixtures only. Never loads .env or contacts a real provider.
const root = await mkdtemp(join(tmpdir(), 'jamrelay-smoke-'));
const key = randomBytes(32).toString('base64');
const cfg: any = {
  PUBLIC_BASE_URL: 'http://127.0.0.1',
  PORT: 0,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'silent',
  TRUST_PROXY: 'false',
  MCP_AUTH_MODE: 'bearer',
  MCP_API_KEY: randomBytes(32).toString('hex'),
  MCP_OAUTH_OWNER_SECRET: randomBytes(32).toString('hex'),
  MCP_OAUTH_STORE_PATH: join(root, 'mcp-oauth.json'),
  MCP_OAUTH_CLIENTS_PATH: join(root, 'clients.json'),
  TOKEN_ENCRYPTION_KEY: key,
  PROVIDER_CREDENTIAL_STORE_PATH: join(root, 'credentials.json'),
  JAMRELAY_DATA_DIR: root,
  JAMRELAY_DB_PATH: join(root, 'jamrelay.db'),
  JAMRELAY_TOOLSET: 'all',
  SPOTIFY_MARKET: 'PL',
};
let server: Server | undefined;
let runner: JobRunner | undefined;
const listening = async (s: Server) => {
  if (!s.listening) await new Promise<void>((r) => s.once('listening', r));
  return `http://127.0.0.1:${(s.address() as any).port}`;
};
async function rpc(base: string, method: string, params: unknown = {}) {
  const response = await fetch(base + '/mcp', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.MCP_API_KEY}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  assert.equal(response.status, 200);
  const raw = await response.text();
  const result = JSON.parse(
    raw.startsWith('event:')
      ? raw
          .split('\n')
          .find((x) => x.startsWith('data:'))!
          .slice(5)
      : raw,
  );
  assert.equal(result.error, undefined);
  return result.result;
}
try {
  server = await startServer(cfg);
  let base = await listening(server);
  const health = await fetch(base + '/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).version, APP_VERSION);
  assert.equal(
    (
      await fetch(base + '/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    ).status,
    401,
  );
  assert.equal((await fetch(base + '/admin', { redirect: 'manual' })).status, 404);
  assert.equal((await fetch(base + '/auth/providers/spotify/start')).status, 401);
  assert.equal(
    (
      await rpc(base, 'initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'isolated-smoke', version: '1' },
      })
    ).serverInfo.version,
    APP_VERSION,
  );
  const discovery = await rpc(base, 'tools/list');
  assert(discovery.tools.some((t: any) => t.name === 'commit_job'));
  console.log(
    `Startup/health/MCP discovery (${discovery.tools.length} tools)/authentication/admin removal: PASS`,
  );
  const page = await fetch(base + '/owner/login');
  const nonce = (await page.text()).match(/name="csrf_token" value="([^"]+)"/)![1];
  const login = await fetch(base + '/owner/login', {
    method: 'POST',
    headers: {
      cookie: page.headers.get('set-cookie')!.split(';')[0],
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ owner_secret: cfg.MCP_OAUTH_OWNER_SECRET, csrf_token: nonce }),
  });
  assert.equal(login.status, 200);
  console.log('Owner authentication with login CSRF: PASS');
  const closed = new Promise<void>((r) => server!.once('close', r));
  process.emit('SIGTERM');
  await closed;
  const end = Date.now() + 3000;
  while (isDatabaseInitialized() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  assert.equal(isDatabaseInitialized(), false);
  server = undefined;
  console.log('Graceful shutdown and SQLite cleanup: PASS');
  resetLifecycleForTests();
  initializeDatabase({ dataDir: root });
  const registry = new ProviderRegistry();
  registry.register({
    summary: { provider: 'fixture', connectionId: 'fixture-main', capabilities: { catalog: true } },
  });
  const grantStore = new McpOAuthStore(cfg.MCP_OAUTH_STORE_PATH);
  const legacyGrant = (await grantStore.getGrant('api-key'))!;
  await grantStore.updateGrant('api-key', ['fixture-main'], legacyGrant.permissions);
  server = createApp(cfg, { registry }).listen(0, '127.0.0.1');
  base = await listening(server);
  const created = await rpc(base, 'tools/call', {
    name: 'create_bulk_job',
    arguments: { type: 'bulk_add_tracks', payload: {}, items: [{ id: 'fixture-track' }] },
  });
  assert.equal(created.isError, undefined);
  const id = created.structuredContent.job_id;
  runner = new JobRunner({
    resolve: async () => {
      throw new Error('Direct fixture must not make a network request');
    },
    hasConnection: (id, provider) => id === 'fixture-main' && provider === 'fixture',
  });
  runner.start();
  const ready = Date.now() + 3000;
  while (getJob(id).payload.phase !== 'ready_to_commit' && Date.now() < ready)
    await new Promise((r) => setTimeout(r, 10));
  await runner.stop();
  runner = undefined;
  const status = await rpc(base, 'tools/call', {
    name: 'get_job_status',
    arguments: { job_id: id },
  });
  assert.equal(status.structuredContent.payload.phase, 'ready_to_commit');
  await rpc(base, 'tools/call', { name: 'cancel_job', arguments: { job_id: id } });
  assert.equal(getJob(id).status, 'cancelled');
  const interrupted = createJob('bulk_add_tracks', { phase: 'resolving' }, []);
  setJobStatus(interrupted, 'running');
  recoverInterruptedJobs();
  assert.equal(getJob(interrupted).status, 'pending');
  console.log('MCP job creation/status/cancellation and queue recovery: PASS');
  await new Promise<void>((r) => server!.close(() => r()));
  server = undefined;
  closeDatabase();
  Object.assign(process.env, {
    JAMRELAY_DATA_DIR: root,
    JAMRELAY_DB_PATH: cfg.JAMRELAY_DB_PATH,
    MCP_OAUTH_STORE_PATH: cfg.MCP_OAUTH_STORE_PATH,
    MCP_OAUTH_CLIENTS_PATH: cfg.MCP_OAUTH_CLIENTS_PATH,
    PROVIDER_CREDENTIAL_STORE_PATH: cfg.PROVIDER_CREDENTIAL_STORE_PATH,
    TOKEN_ENCRYPTION_KEY: key,
  });
  for (const command of [
    ['status'],
    ['jobs', 'list'],
    ['jobs', 'inspect', String(id)],
    ['diagnostics'],
    ['connections', 'list'],
    ['clients', 'list'],
    ['backup', 'create'],
    ['backup', 'list'],
  ])
    assert.equal(await runOperator(command, () => {}), 0, command.join(' '));
  console.log('Local operator status/jobs/diagnostics/connections/clients/backups: PASS');
} finally {
  await runner?.stop();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server!.close(() => r()));
  }
  closeDatabase();
  await rm(root, { recursive: true, force: true });
}
