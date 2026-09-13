import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createJob,
  getJob,
  getJobItems,
  setJobStatus,
  updateJobItem,
  recoverInterruptedJobs,
  claimEligibleJob,
} from '../src/db/jobs.js';
import { closeDatabase, initializeDatabase } from '../src/db/database.js';
import { JobRunner } from '../src/db/job-runner.js';
import { recordRateLimit } from '../src/db/state.js';
import { registerAdvanced } from '../src/mcp/helpers.js';
import { createApp } from '../src/index.js';
import { SpotifyApiError } from '../src/spotify/errors.js';

let root: string | undefined;
afterEach(async () => {
  closeDatabase();
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
  vi.restoreAllMocks();
});
async function setup() {
  root = await mkdtemp(join(tmpdir(), 'tunelink-jobs-'));
  initializeDatabase({ dataDir: root, migrationsDir: join(process.cwd(), 'db/migrations') });
}
const directItems = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `spotify:track:${i}` }));
const waitFor = async (fn: () => boolean, timeout = 3000) => {
  const end = Date.now() + timeout;
  while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  expect(fn()).toBe(true);
};

describe('durable job regressions', () => {
  it('normal multi-batch progress does not increment attempts', async () => {
    await setup();
    const id = createJob('bulk_add_tracks', { phase: 'created' }, directItems(30));
    const runner = new JobRunner({ request: async () => null } as any);
    runner.start();
    await waitFor(() => getJob(id, 0, 1).payload.phase === 'ready_to_commit');
    await runner.stop();
    expect(getJob(id, 0, 1)).toMatchObject({ attempts: 0, status: 'running' });
  });

  it('rate-limit waiting does not increment attempts and respects run_after', async () => {
    await setup();
    recordRateLimit('spotify', 'search', 600);
    const id = createJob('bulk_add_tracks', { phase: 'created' }, [
      { title: 'Blocked', artist: 'Artist' },
    ]);
    const runner = new JobRunner({
      request: async () => {
        throw new SpotifyApiError(429, 'RATE_LIMIT_EXCEEDED', 'blocked', 600, false, 'search');
      },
    } as any);
    runner.start();
    await waitFor(() => getJob(id, 0, 1).status === 'waiting');
    await runner.stop();
    const job = getJob(id, 0, 1);
    expect(job.attempts).toBe(0);
    expect(job.runAfter).toBeGreaterThan(Date.now());
    expect(claimEligibleJob(Date.now())).toBeNull();
  });

  it('actual processing failure increments attempts and max_attempts stops retry', async () => {
    await setup();
    const id = createJob(
      'bulk_add_tracks',
      { phase: 'created' },
      [{ title: 'Fails', artist: 'Artist' }],
      1,
    );
    const runner = new JobRunner({
      request: async () => {
        throw new Error('retryable');
      },
    } as any);
    runner.start();
    await waitFor(() => getJob(id, 0, 1).status === 'failed');
    await runner.stop();
    expect(getJob(id, 0, 1)).toMatchObject({ attempts: 1, status: 'failed' });
  });

  it('recovery resumes resolving jobs but never requeues committing jobs', async () => {
    await setup();
    const resolving = createJob('bulk_add_tracks', { phase: 'resolving' }, []);
    const committing = createJob(
      'bulk_add_tracks',
      { phase: 'committing', commit_started_at: Date.now() },
      [],
    );
    setJobStatus(resolving, 'running');
    setJobStatus(committing, 'running');
    expect(recoverInterruptedJobs()).toBe(2);
    expect(getJob(resolving, 0, 1)).toMatchObject({
      status: 'pending',
      payload: { phase: 'resolving' },
    });
    expect(getJob(committing, 0, 1)).toMatchObject({
      status: 'failed',
      payload: { phase: 'failed', manual_review: true },
    });
    expect(claimEligibleJob(Date.now())?.toString()).not.toBe(committing.toString());
  });

  it('cancelled jobs are never processed and invalid commit phase is rejected', async () => {
    await setup();
    const id = createJob('bulk_add_tracks', { phase: 'created' }, directItems(1));
    setJobStatus(id, 'cancelled');
    const runner = new JobRunner({
      request: async () => {
        throw new Error('must not call');
      },
    } as any);
    runner.start();
    await new Promise((r) => setTimeout(r, 80));
    await runner.stop();
    expect(getJob(id, 0, 1).status).toBe('cancelled');
    expect(getJobItems(id)[0].status).toBe('pending');
    const callbacks = new Map<string, (a: any) => Promise<any>>();
    registerAdvanced(
      {
        registerTool(n: string, _c: unknown, cb: any) {
          callbacks.set(n, cb);
        },
      },
      { request: async () => null, json: async () => null } as any,
      true,
    );
    const result = await callbacks.get('commit_job')!({ job_id: id });
    expect(result.structuredContent.error).toBe('invalid_commit_state');
  });

  it('commit_job writes ordered URIs and preserves deferred options', async () => {
    await setup();
    const id = createJob(
      'bulk_add_tracks',
      {
        phase: 'ready_to_commit',
        playlist_id: 'playlist',
        strict: true,
        skip_existing: true,
        skip_duplicates: true,
        dry_run: false,
      },
      directItems(3),
    );
    const rows = getJobItems(id);
    const uris = ['spotify:track:a', 'spotify:track:existing', 'spotify:track:a'];
    rows.forEach((row, i) =>
      updateJobItem(row.id, 'completed', { resolution: { status: 'matched', uri: uris[i] } }),
    );
    const writes: string[][] = [];
    const callbacks = new Map<string, (a: any) => Promise<any>>();
    registerAdvanced(
      {
        registerTool(n: string, _c: unknown, cb: any) {
          callbacks.set(n, cb);
        },
      },
      {
        request: async (p: string) =>
          p.startsWith('/playlists/')
            ? { items: [{ item: { uri: 'spotify:track:existing' } }], next: null }
            : null,
        json: async (_p: string, body: any) => {
          writes.push(body.uris);
          return {};
        },
      } as any,
      true,
    );
    const result = await callbacks.get('commit_job')!({ job_id: id });
    expect(result.structuredContent.job_status).toBe('completed');
    expect(writes.flat()).toEqual(['spotify:track:a']);
    expect(getJob(id, 0, 1).status).toBe('completed');
  });

  it('deferred dry_run persists completed state and performs no mutation', async () => {
    await setup();
    const id = createJob(
      'bulk_add_tracks',
      { phase: 'ready_to_commit', playlist_id: 'playlist', strict: true, dry_run: true },
      [{ resolution: { status: 'matched', uri: 'spotify:track:a' } }],
    );
    updateJobItem(getJobItems(id)[0].id, 'completed', {
      resolution: { status: 'matched', uri: 'spotify:track:a' },
    });
    const json = vi.fn(async () => {
      throw new Error('mutation');
    });
    const callbacks = new Map<string, (a: any) => Promise<any>>();
    registerAdvanced(
      {
        registerTool(n: string, _c: unknown, cb: any) {
          callbacks.set(n, cb);
        },
      },
      { request: async () => null, json } as any,
      true,
    );
    await callbacks.get('commit_job')!({ job_id: id });
    expect(json).not.toHaveBeenCalled();
    expect(getJob(id, 0, 1)).toMatchObject({
      status: 'completed',
      payload: { phase: 'completed', dry_run: true },
    });
  });
});

describe('Express MCP body limit', () => {
  const cfg: any = {
    SPOTIFY_CLIENT_ID: 'id',
    SPOTIFY_CLIENT_SECRET: 'secret',
    SPOTIFY_REDIRECT_URI: 'https://example.com/cb',
    TOKEN_ENCRYPTION_KEY: 'unused',
    PORT: 0,
    HOST: '127.0.0.1',
    PUBLIC_BASE_URL: 'http://localhost',
    LOG_LEVEL: 'silent',
    MCP_AUTH_MODE: 'bearer',
    MCP_API_KEY: 'test-key',
    TRUST_PROXY: 'false',
    SPOTIFY_MARKET: 'PL',
  };
  async function request(payload: unknown) {
    const app = createApp(cfg, {
      auth: { connected: async () => false } as any,
      client: { request: async () => null, json: async () => null } as any,
      logger: { info() {}, warn() {} } as any,
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', () => r()));
    const address = server.address() as any;
    const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await new Promise<void>((r) => server.close(() => r()));
    return response.status;
  }
  it('accepts a realistic multi-thousand-track MCP payload under 2mb', async () => {
    const status = await request({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'create_bulk_job',
        arguments: {
          type: 'bulk_add_tracks',
          items: Array.from({ length: 10000 }, (_, i) => ({ id: `spotify:track:${i}` })),
        },
      },
    });
    expect(status).not.toBe(413);
  });
  it('rejects a payload above 2mb', async () => {
    const status = await request({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'create_bulk_job',
        arguments: {
          type: 'bulk_add_tracks',
          items: Array.from({ length: 10000 }, () => ({
            title: 'x'.repeat(300),
            artist: 'y'.repeat(300),
          })),
        },
      },
    });
    expect(status).toBe(400);
  });
});
