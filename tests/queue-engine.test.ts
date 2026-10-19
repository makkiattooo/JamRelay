import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';
import {
  createJob,
  getJob,
  getJobItems,
  cancelJob,
  setJobStatus,
  claimEligibleJob,
  retryDelay,
  reserveJobCommit,
  finishJobCommit,
  recoverInterruptedJobs,
  resumeJob,
  updateJobItem,
  listJobs,
} from '../src/db/jobs.js';
import { JobRunner, providerJobResolver } from '../src/db/job-runner.js';
import { toolContext } from '../src/mcp/context.js';
import { registerAdvanced } from '../src/mcp/helpers.js';
import { ProviderRegistry } from '../src/providers/registry.js';
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'jamrelay-queue-'));
  initializeDatabase({ dataDir: root });
});
afterEach(async () => {
  closeDatabase();
  await rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
const until = async (fn: () => boolean) => {
  const end = Date.now() + 2500;
  while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  expect(fn()).toBe(true);
};
function tools(
  client: any = { request: async () => ({ items: [], next: null }), json: async () => ({}) },
) {
  const map = new Map<string, (a: any) => Promise<any>>();
  registerAdvanced(
    { registerTool: (n: string, _cfg: any, cb: any) => map.set(n, cb) },
    client,
    true,
  );
  return map;
}
const access = (clientId: string, connectionIds = ['spotify-default']) => ({
  requestId: 'test',
  signal: new AbortController().signal,
  deadlineAt: Date.now() + 10000,
  mcpAccess: {
    clientId,
    connectionIds,
    permissions: ['playlist.write', 'playlist.read', 'diagnostics.read'],
  },
});
describe('durable queue safety', () => {
  it('atomically claims once across competing SQLite processes', async () => {
    const id = createJob('bulk_add_tracks', {}, []);
    const code = `import {initializeDatabase,closeDatabase} from './src/db/database.ts';import {claimEligibleJob} from './src/db/jobs.ts';initializeDatabase({dataDir:process.argv[1]});console.log(JSON.stringify(claimEligibleJob()));closeDatabase();`;
    const claims = await Promise.all(
      Array.from(
        { length: 3 },
        () =>
          new Promise<number | null>((resolve, reject) => {
            const p = spawn(
              process.execPath,
              ['--import', 'tsx', '--input-type=module', '-e', code, root],
              { cwd: process.cwd() },
            );
            let out = '';
            let err = '';
            p.stdout.on('data', (b) => (out += b));
            p.stderr.on('data', (b) => (err += b));
            p.on('error', reject);
            p.on('close', (n) => (n ? reject(new Error(err)) : resolve(JSON.parse(out.trim()))));
          }),
      ),
    );
    expect(claims.filter((n) => n === id)).toHaveLength(1);
  }, 15000);
  it('never claims a future, cancelled, terminal or reserved job', () => {
    const future = createJob('bulk_add_tracks', {}, []);
    setJobStatus(future, 'waiting', Date.now() + 60000);
    const cancelled = createJob('bulk_add_tracks', {}, []);
    cancelJob(cancelled);
    const terminal = createJob('bulk_add_tracks', {}, []);
    setJobStatus(terminal, 'failed');
    expect(claimEligibleJob()).toBeNull();
    expect(claimEligibleJob(Date.now() + 60001)).toBe(future);
  });
  it('enforces terminal transitions and preserves cancellation against late completions', () => {
    const id = createJob('bulk_add_tracks', {}, [{}]);
    setJobStatus(id, 'running');
    cancelJob(id);
    for (const status of ['pending', 'waiting', 'completed', 'running'] as const)
      expect(setJobStatus(id, status)).toBe(false);
    updateJobItem(getJobItems(id)[0].id, 'completed');
    expect(getJobItems(id)[0].status).toBe('pending');
    expect(resumeJob(id)).toBe(false);
  });
  it('bounds exponential backoff with jitter', () => {
    expect(retryDelay(1, () => 0)).toBe(1000);
    expect(retryDelay(2, () => 0)).toBe(2000);
    expect(retryDelay(3, () => 1)).toBe(5000);
    expect(retryDelay(30, () => 1)).toBe(300000);
  });
  it('persists transient backoff and stops at max attempts', async () => {
    const id = createJob('bulk_add_tracks', {}, [{ title: 'a', artist: 'b' }], 2);
    const runner = new JobRunner({
      resolve: async () => {
        throw new Error('temporary');
      },
    });
    runner.start();
    await until(() => getJob(id).attempts === 1);
    await runner.stop();
    expect(getJob(id).runAfter).toBeGreaterThan(Date.now());
    getDatabase().prepare('UPDATE jobs SET run_after=0 WHERE id=?').run(id);
    const second = new JobRunner({
      resolve: async () => {
        throw new Error('temporary');
      },
    });
    second.start();
    await until(() => getJob(id).status === 'failed');
    await second.stop();
    expect(getJob(id).attempts).toBe(2);
  });
  it('persists connection-scoped 429 cooldown without failed attempts', async () => {
    const id = createJob('bulk_add_tracks', { provider: 'youtube', connection_id: 'yt' }, [
      { title: 'a', artist: 'b' },
    ]);
    const runner = new JobRunner({
      resolve: async () => {
        throw { status: 429, retryAfter: 120, scope: 'search' };
      },
    });
    runner.start();
    await until(() => getJob(id).status === 'waiting');
    await runner.stop();
    expect(getJob(id).runAfter).toBeGreaterThan(Date.now() + 110000);
    expect(getJob(id).attempts).toBe(0);
    expect(
      getDatabase().prepare('SELECT provider,connection_id FROM rate_limit_state').get(),
    ).toMatchObject({ provider: 'youtube', connection_id: 'yt' });
  });
  it('never uses the Spotify resolver for another provider', async () => {
    const registry = new ProviderRegistry();
    const spotify = { resolve: vi.fn() };
    const search = vi.fn(async () => [
      { id: 'video-_1', name: 'Song', artists: [{ name: 'Artist' }] },
    ]);
    registry.register({
      summary: { provider: 'youtube', connectionId: 'yt', capabilities: { catalog: true } },
      catalog: { searchTracks: search, getTrack: async () => null },
    });
    const resolver = providerJobResolver(registry, spotify);
    expect(
      await resolver.resolve(
        { title: 'Song', artist: 'Artist' },
        { provider: 'youtube', connectionId: 'yt' },
      ),
    ).toMatchObject({ status: 'matched', id: 'video-_1' });
    expect(spotify.resolve).not.toHaveBeenCalled();
    await expect(
      resolver.resolve({ title: 'a', artist: 'b' }, { provider: 'spotify', connectionId: 'yt' }),
    ).rejects.toThrow();
  });
  it('fails unknown job executors clearly', async () => {
    const id = createJob('unknown', {}, []);
    const resolve = vi.fn();
    const runner = new JobRunner({ resolve });
    runner.start();
    await until(() => getJob(id).status === 'failed');
    await runner.stop();
    expect(getJob(id).lastErrorCode).toBe('UNKNOWN_JOB_TYPE');
    expect(resolve).not.toHaveBeenCalled();
  });
  it('cooperates with cancellation during an external read and ignores late results', async () => {
    let done!: (r: any) => void;
    let entered = false;
    const id = createJob('bulk_add_tracks', {}, [{ title: 'a', artist: 'b' }]);
    const runner = new JobRunner({
      resolve: async () => {
        entered = true;
        return new Promise((r) => {
          done = r;
        });
      },
    });
    runner.start();
    await until(() => entered);
    cancelJob(id);
    done({ status: 'matched', id: 'a', uri: 'spotify:track:a' });
    await runner.stop();
    expect(getJob(id).status).toBe('cancelled');
    expect(getJobItems(id)[0].status).toBe('pending');
  });
  it('allows one concurrent commit and returns completed results idempotently', async () => {
    const id = createJob('bulk_add_tracks', { phase: 'ready_to_commit', playlist_id: 'p' }, [{}]);
    updateJobItem(getJobItems(id)[0].id, 'completed', { resolution: { uri: 'spotify:track:a' } });
    let done!: (v: any) => void;
    const json = vi.fn(
      async () =>
        new Promise((r) => {
          done = r;
        }),
    );
    const map = tools({ request: async () => ({ items: [], next: null }), json });
    const first = map.get('commit_job')!({ job_id: id });
    await until(() => json.mock.calls.length === 1);
    const duplicate = await map.get('commit_job')!({ job_id: id });
    expect(duplicate.structuredContent.error).toBeDefined();
    done({});
    expect((await first).structuredContent.job_status).toBe('completed');
    expect((await map.get('commit_job')!({ job_id: id })).structuredContent.job_status).toBe(
      'completed',
    );
    expect(json).toHaveBeenCalledTimes(1);
  });
  it('marks interrupted commits for manual review and never resumes or replays them', () => {
    const id = createJob('bulk_add_tracks', { phase: 'ready_to_commit' }, []);
    expect(reserveJobCommit(id)).toBe(true);
    expect(reserveJobCommit(id)).toBe(false);
    recoverInterruptedJobs();
    expect(getJob(id)).toMatchObject({
      status: 'failed',
      commitState: 'uncertain',
      manualReview: 1,
    });
    expect(resumeJob(id)).toBe(false);
    expect(claimEligibleJob()).toBeNull();
  });
  it('recovers read progress but preserves ready and cancelled jobs', () => {
    const read = createJob('bulk_add_tracks', { phase: 'resolving' }, []);
    setJobStatus(read, 'running');
    const ready = createJob('bulk_add_tracks', { phase: 'ready_to_commit' }, []);
    setJobStatus(ready, 'running');
    const cancel = createJob('bulk_add_tracks', {}, []);
    cancelJob(cancel);
    recoverInterruptedJobs();
    expect(getJob(read).status).toBe('pending');
    expect(getJob(ready).payload.phase).toBe('ready_to_commit');
    expect(getJob(cancel).status).toBe('cancelled');
  });
  it('enforces client ownership and connection grants on all job operations', async () => {
    let id = 0;
    await toolContext.run(access('owner'), async () => {
      id = createJob('bulk_add_tracks', {}, []);
      expect(listJobs()).toHaveLength(1);
    });
    for (const context of [access('unrelated'), access('owner', ['other'])])
      await toolContext.run(context, async () => {
        expect(listJobs()).toHaveLength(0);
        expect(() => getJob(id)).toThrow('JOB_ACCESS_DENIED');
        expect(() => cancelJob(id)).toThrow('JOB_ACCESS_DENIED');
        expect(() => resumeJob(id)).toThrow('JOB_ACCESS_DENIED');
        await expect(tools().get('commit_job')!({ job_id: id })).rejects.toThrow(
          'JOB_ACCESS_DENIED',
        );
      });
  });
  it('does not automatically expose legacy unowned jobs to MCP clients', async () => {
    createJob('bulk_add_tracks', {}, []);
    await toolContext.run(access('client'), async () => expect(listJobs()).toEqual([]));
  });
});

describe('external commit race recovery', () => {
  it('retains cancellation and manual review when a provider write completes late', async () => {
    const id = createJob('bulk_add_tracks', { phase: 'ready_to_commit', playlist_id: 'p' }, [{}]);
    updateJobItem(getJobItems(id)[0].id, 'completed', { resolution: { uri: 'spotify:track:a' } });
    let finish!: (v: any) => void;
    const json = vi.fn(
      async () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    const map = tools({ request: async () => ({ items: [], next: null }), json });
    const committing = map.get('commit_job')!({ job_id: id });
    await until(() => json.mock.calls.length === 1);
    cancelJob(id);
    finish({});
    const result = await committing;
    expect(result.structuredContent.job_status).toBe('cancelled');
    expect(getJob(id)).toMatchObject({
      status: 'cancelled',
      commitState: 'uncertain',
      manualReview: 1,
    });
    expect(resumeJob(id)).toBe(false);
    recoverInterruptedJobs();
    expect(getJob(id).status).toBe('cancelled');
  });
  it('runs two workers without duplicate resolution', async () => {
    const id = createJob('bulk_add_tracks', {}, [{ title: 'a', artist: 'b' }]);
    const resolve = vi.fn(async () => ({ status: 'matched', id: 'x', uri: 'spotify:track:x' }));
    const a = new JobRunner({ resolve });
    const b = new JobRunner({ resolve });
    a.start();
    b.start();
    await until(() => getJob(id).payload.phase === 'ready_to_commit');
    await Promise.all([a.stop(), b.stop()]);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
  it('fails unsupported provider capabilities without invoking Spotify', async () => {
    const registry = new ProviderRegistry();
    registry.register({
      summary: { provider: 'apple-music', connectionId: 'apple', capabilities: {} },
    });
    const spotify = { resolve: vi.fn() };
    const resolver = providerJobResolver(registry, spotify);
    await expect(
      resolver.resolve(
        { title: 'a', artist: 'b' },
        { provider: 'apple-music', connectionId: 'apple' },
      ),
    ).rejects.toThrow('CAPABILITY_UNSUPPORTED');
    expect(spotify.resolve).not.toHaveBeenCalled();
  });
});

describe('provider commit and grant integration', () => {
  it('commits provider-native IDs through the original connection when the adapter returns no ok flag', async () => {
    const id = createJob(
      'bulk_add_tracks',
      {
        phase: 'ready_to_commit',
        playlist_id: 'ytplaylist',
        provider: 'youtube',
        connection_id: 'yt',
      },
      [{}],
    );
    updateJobItem(getJobItems(id)[0].id, 'completed', { resolution: { uri: 'video-_1' } });
    const add = vi.fn(async () => ({ added: 1, quota_cost: 50 }));
    const map = new Map<string, (a: any) => Promise<any>>();
    registerAdvanced(
      { registerTool: (n: string, _c: any, cb: any) => map.set(n, cb) },
      { request: async () => null, json: vi.fn() } as any,
      true,
      undefined,
      { add } as any,
    );
    const result = await map.get('commit_job')!({ job_id: id });
    expect(result.structuredContent.job_status).toBe('completed');
    expect(add).toHaveBeenCalledWith(
      'ytplaylist',
      ['video-_1'],
      expect.objectContaining({ provider: 'youtube', connection_id: 'yt' }),
    );
  });
  it('enforces the manifest and client identity through the real MCP tool wrapper', async () => {
    const { registerTools } = await import('../src/mcp/tools.js');
    const registry = new ProviderRegistry();
    registry.register({
      summary: {
        connectionId: 'spotify-default',
        provider: 'spotify',
        capabilities: { catalog: true, playlistWrite: true },
      },
    });
    const map = new Map<string, (a: any) => Promise<any>>();
    registerTools(
      { registerTool: (n: string, _cfg: any, cb: any) => map.set(n, cb) } as any,
      { request: async () => null, json: async () => null } as any,
      undefined,
      true,
      registry,
    );
    const created = await toolContext.run(access('a'), () =>
      map.get('create_bulk_job')!({
        type: 'bulk_add_tracks',
        payload: {},
        items: [{ id: 'abc' }],
        max_attempts: 5,
      }),
    );
    const id = created.structuredContent.job_id;
    expect(id).toBeGreaterThan(0);
    for (const name of ['get_job_status', 'resume_job', 'commit_job', 'cancel_job']) {
      const denied = await toolContext.run(access('b'), () =>
        map.get(name)!({ job_id: id, offset: 0, limit: 25 }),
      );
      expect(denied.isError).toBe(true);
      expect(denied.content[0].text).toContain('JOB_ACCESS_DENIED');
    }
    const noPermission = {
      ...access('a'),
      mcpAccess: { clientId: 'a', connectionIds: ['spotify-default'], permissions: [] },
    };
    const denied = await toolContext.run(noPermission, () =>
      map.get('cancel_job')!({ job_id: id }),
    );
    expect(denied.content[0].text).toContain('PERMISSION_NOT_GRANTED');
  });
  it('upgrades a populated 0011 job database without changing history', async () => {
    const { mkdirSync, readdirSync, copyFileSync } = await import('node:fs');
    closeDatabase();
    const directory = join(root, 'old-migrations');
    mkdirSync(directory);
    for (const name of readdirSync('db/migrations').filter(
      (n) => /^\d{4}_/.test(n) && Number(n.slice(0, 4)) <= 11,
    ))
      copyFileSync(join('db/migrations', name), join(directory, name));
    const legacyDir = join(root, 'legacy');
    const db = initializeDatabase({ dataDir: legacyDir, migrationsDir: directory });
    const row = db
      .prepare(
        "INSERT INTO jobs(type,status,payload_json,attempts,max_attempts,created_at,updated_at) VALUES ('bulk_add_tracks','waiting','{\"phase\":\"resolving\"}',2,5,1,1)",
      )
      .run();
    const id = Number(row.lastInsertRowid);
    closeDatabase();
    initializeDatabase({ dataDir: legacyDir });
    expect(listJobs(0, 25, { provider: 'spotify', connectionId: 'spotify-default' })).toHaveLength(
      1,
    );
    expect(getJob(id)).toMatchObject({
      status: 'waiting',
      attempts: 2,
      provider: 'spotify',
      connectionId: 'spotify-default',
      ownerClientId: null,
    });
    expect(getDatabase().prepare('PRAGMA integrity_check').get()).toMatchObject({
      integrity_check: 'ok',
    });
  });
});

describe('atomic commit finalization', () => {
  it('persists result and terminal state in one transition', () => {
    const db = getDatabase();
    expect(db.prepare('PRAGMA synchronous').get()).toMatchObject({ synchronous: 1 });
    const prepare = db.prepare.bind(db);
    const barrierLevels: number[] = [];
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('UPDATE jobs SET') && sql.includes("commit_state='reserved'"))
        barrierLevels.push(Number(prepare('PRAGMA synchronous').get()?.synchronous));
      return prepare(sql);
    });
    const id = createJob('bulk_add_tracks', { phase: 'ready_to_commit' }, []);
    expect(reserveJobCommit(id)).toBe(true);
    finishJobCommit(id, { ok: true });
    expect(barrierLevels).toEqual([2, 2]);
    expect(db.prepare('PRAGMA synchronous').get()).toMatchObject({ synchronous: 1 });
    expect(getJob(id)).toMatchObject({
      status: 'completed',
      commitState: 'completed',
      result: '{"ok":true}',
    });
    recoverInterruptedJobs();
    expect(getJob(id).status).toBe('completed');
  });
  it('honors persisted cancellation even when the worker observed an earlier state', () => {
    const id = createJob('bulk_add_tracks', { phase: 'ready_to_commit' }, []);
    reserveJobCommit(id);
    cancelJob(id);
    finishJobCommit(id, { ok: true }, false);
    expect(getJob(id)).toMatchObject({
      status: 'cancelled',
      commitState: 'uncertain',
      manualReview: 1,
    });
  });
});

describe('commit recovery evidence', () => {
  it('retains a pre-commit snapshot for an existing provider playlist', async () => {
    const id = createJob(
      'bulk_add_tracks',
      { phase: 'ready_to_commit', provider: 'youtube', connection_id: 'yt', playlist_id: 'p' },
      [{}],
    );
    updateJobItem(getJobItems(id)[0].id, 'completed', { resolution: { uri: 'video1' } });
    const gateway = {
      get: async () => ({ id: 'p', snapshot_id: 'before' }),
      items: async () => ({
        items: [{ id: 'old', name: 'Old', artists: [] }],
        next: null,
        total: 1,
      }),
      add: async () => ({ added: 1 }),
    };
    const callbacks = new Map<string, (a: any) => Promise<any>>();
    registerAdvanced(
      { registerTool: (n: string, _c: any, cb: any) => callbacks.set(n, cb) },
      { request: async () => null, json: async () => null } as any,
      true,
      undefined,
      gateway as any,
    );
    const result = await callbacks.get('commit_job')!({ job_id: id });
    expect(result.structuredContent.job_status).toBe('completed');
    const snapshot = getDatabase()
      .prepare('SELECT provider_id,connection_id FROM playlist_snapshots WHERE id=?')
      .get(getJob(id).payload.pre_commit_snapshot_id);
    expect(snapshot).toMatchObject({ provider_id: 'youtube', connection_id: 'yt' });
  });
  it('preserves a newly created playlist ID if appending tracks fails', async () => {
    const id = createJob(
      'create_playlist_from_tracks',
      { phase: 'ready_to_commit', name: 'Fixture' },
      [{}],
    );
    updateJobItem(getJobItems(id)[0].id, 'completed', { resolution: { uri: 'spotify:track:a' } });
    const callbacks = tools({
      request: async () => null,
      json: async (path: string) => {
        if (path === '/me/playlists') return { id: 'created' };
        throw new Error('upstream-failed');
      },
    });
    await callbacks.get('commit_job')!({ job_id: id });
    expect(getJob(id)).toMatchObject({
      status: 'failed',
      commitState: 'uncertain',
      payload: { playlist_id: 'created', created_playlist: { id: 'created' }, manual_review: true },
    });
  });
  it('retains ordered chunk progress and never automatically replays a partial failure', async () => {
    const id = createJob(
      'bulk_add_tracks',
      { phase: 'ready_to_commit', playlist_id: 'p' },
      Array.from({ length: 101 }, () => ({})),
    );
    getJobItems(id).forEach((row, i) =>
      updateJobItem(row.id, 'completed', { resolution: { uri: `spotify:track:${i}` } }),
    );
    let writes = 0;
    const callbacks = tools({
      request: async () => null,
      json: async () => {
        if (++writes === 2) throw new Error('uncertain');
        return {};
      },
    });
    const result = await callbacks.get('commit_job')!({ job_id: id });
    expect(result.structuredContent.result).toMatchObject({
      partial: true,
      successfully_written_count: 100,
      completed_chunks: 1,
      rollback_attempted: false,
    });
    expect(resumeJob(id)).toBe(false);
    await callbacks.get('commit_job')!({ job_id: id });
    expect(writes).toBe(2);
  });
});

describe('commit target capability boundary', () => {
  it('returns a capability error before reserving or writing an unsupported operation', async () => {
    const id = createJob(
      'bulk_add_tracks',
      { phase: 'ready_to_commit', provider: 'youtube', connection_id: 'yt', playlist_id: 'p' },
      [{}],
    );
    updateJobItem(getJobItems(id)[0].id, 'completed', { resolution: { uri: 'video1' } });
    const add = vi.fn();
    const callbacks = new Map<string, (a: any) => Promise<any>>();
    registerAdvanced(
      { registerTool: (n: string, _c: any, cb: any) => callbacks.set(n, cb) },
      { request: async () => null, json: async () => null } as any,
      true,
      undefined,
      {
        assertSupported: () => {
          throw new Error('unsupported');
        },
        add,
      } as any,
    );
    const result = await callbacks.get('commit_job')!({ job_id: id });
    expect(result.structuredContent.error).toBe('CAPABILITY_UNAVAILABLE');
    expect(getJob(id).commitState).toBe('none');
    expect(add).not.toHaveBeenCalled();
  });
  it('rejects a persisted resolution from another provider before external writes', async () => {
    const id = createJob(
      'bulk_add_tracks',
      { phase: 'ready_to_commit', provider: 'youtube', connection_id: 'yt', playlist_id: 'p' },
      [{}],
    );
    updateJobItem(getJobItems(id)[0].id, 'completed', {
      resolution: { uri: 'spotify:track:a', provider: 'spotify', connection_id: 'spotify-default' },
    });
    const add = vi.fn();
    const callbacks = new Map<string, (a: any) => Promise<any>>();
    registerAdvanced(
      { registerTool: (n: string, _c: any, cb: any) => callbacks.set(n, cb) },
      { request: async () => null, json: async () => null } as any,
      true,
      undefined,
      { add } as any,
    );
    const result = await callbacks.get('commit_job')!({ job_id: id });
    expect(result.structuredContent.error).toBe('RESOLUTION_TARGET_MISMATCH');
    expect(add).not.toHaveBeenCalled();
    expect(getJob(id).commitState).toBe('none');
  });
});

describe('provider dry-run capability safety', () => {
  it('preserves dry-run preview without requiring a provider write capability', async () => {
    const id = createJob(
      'bulk_add_tracks',
      {
        phase: 'ready_to_commit',
        provider: 'youtube',
        connection_id: 'yt',
        playlist_id: 'p',
        dry_run: true,
      },
      [{}],
    );
    updateJobItem(getJobItems(id)[0].id, 'completed', { resolution: { uri: 'video1' } });
    const assertSupported = vi.fn(() => {
      throw new Error('no write capability');
    });
    const add = vi.fn();
    const callbacks = new Map<string, (a: any) => Promise<any>>();
    registerAdvanced(
      { registerTool: (n: string, _c: any, cb: any) => callbacks.set(n, cb) },
      { request: async () => null, json: async () => null } as any,
      true,
      undefined,
      { assertSupported, add } as any,
    );
    const result = await callbacks.get('commit_job')!({ job_id: id });
    expect(result.structuredContent).toMatchObject({
      job_status: 'completed',
      dry_run: true,
      requested_count: 1,
    });
    expect(assertSupported).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});

describe('deferred provider provenance and read capability', () => {
  it('does not reuse synchronous Spotify resolutions or cooldowns in a different provider job', async () => {
    const { recordRateLimit } = await import('../src/db/state.js');
    recordRateLimit('spotify', 'search', 600, 'busy', 'spotify-default');
    const callbacks = new Map<string, (a: any) => Promise<any>>();
    const gateway = {
      assertSupported: () => ({ summary: { provider: 'youtube', connectionId: 'yt' } }),
    };
    const resolver = {
      resolveMany: async () => [
        { status: 'matched', uri: 'spotify:track:a' },
        { status: 'waiting' },
      ],
      getLastBatchMetrics: () => ({}),
      resolve: async () => null,
      rememberTrack: async () => null,
    };
    registerAdvanced(
      { registerTool: (n: string, _c: any, cb: any) => callbacks.set(n, cb) },
      { request: async () => null, json: async () => null } as any,
      true,
      undefined,
      gateway as any,
      resolver,
    );
    const result = await callbacks.get('bulk_add_tracks')!({
      playlist_id: 'p',
      connection_id: 'yt',
      tracks: [
        { title: 'a', artist: 'a' },
        { title: 'b', artist: 'b' },
      ],
      strict: true,
      skip_existing: false,
      dry_run: false,
    });
    const job = getJob(result.structuredContent.job_id);
    expect(job).toMatchObject({ provider: 'youtube', connectionId: 'yt', status: 'waiting' });
    expect(job.runAfter).toBeLessThanOrEqual(Date.now() + 1000);
    expect(getJobItems(job.id).every((item) => item.status === 'pending')).toBe(true);
  });
  it('fails a dry-run skip-existing read capability before reservation without requiring writes', async () => {
    const id = createJob(
      'bulk_add_tracks',
      {
        phase: 'ready_to_commit',
        provider: 'youtube',
        connection_id: 'yt',
        playlist_id: 'p',
        dry_run: true,
        skip_existing: true,
      },
      [{}],
    );
    updateJobItem(getJobItems(id)[0].id, 'completed', { resolution: { uri: 'video1' } });
    const assertSupported = vi.fn();
    const callbacks = new Map<string, (a: any) => Promise<any>>();
    registerAdvanced(
      { registerTool: (n: string, _c: any, cb: any) => callbacks.set(n, cb) },
      { request: async () => null, json: async () => null } as any,
      true,
      undefined,
      {
        assertSupported,
        resolveReadTarget: () => {
          throw new Error('read unavailable');
        },
      } as any,
    );
    const result = await callbacks.get('commit_job')!({ job_id: id });
    expect(result.structuredContent.error).toBe('CAPABILITY_UNAVAILABLE');
    expect(getJob(id).commitState).toBe('none');
    expect(assertSupported).not.toHaveBeenCalled();
  });
});
