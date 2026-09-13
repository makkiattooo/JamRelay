import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, initializeDatabase } from '../src/db/database.js';
import { SpotifyClient } from '../src/spotify/client.js';
import { TrackResolver } from '../src/spotify/resolver.js';
import { upsertTrackAndAlias } from '../src/db/state.js';
import { createJob, getJob, updateJobItem } from '../src/db/jobs.js';
import { registerAdvanced } from '../src/mcp/helpers.js';

let root: string | undefined;
afterEach(async () => {
  closeDatabase();
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
  vi.restoreAllMocks();
});
async function setup() {
  root = await mkdtemp(join(tmpdir(), 'tunelink-runtime-'));
  initializeDatabase({ dataDir: root, migrationsDir: join(process.cwd(), 'db/migrations') });
}
const auth = { accessToken: async () => 'test-token' } as any;

describe('persistent Spotify runtime state', () => {
  it('aggregates 429 errors and blocks search before the next HTTP request', async () => {
    await setup();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        return new Response(
          JSON.stringify({ error: { reason: 'QUOTA_EXCEEDED', message: 'quota' } }),
          { status: 429, headers: { 'retry-after': '60000' } },
        );
      }),
    );
    const client = new SpotifyClient(auth);
    await expect(client.request('/search?q=one')).rejects.toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
    });
    closeDatabase();
    initializeDatabase({ dataDir: root!, migrationsDir: join(process.cwd(), 'db/migrations') });
    await expect(client.request('/search?q=two')).rejects.toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
      scope: 'search',
    });
    expect(calls).toBe(1);
    const db = initializeDatabase();
    expect(db.prepare('SELECT occurrences, reason FROM api_errors').all()).toEqual([
      { occurrences: 1, reason: 'QUOTA_EXCEEDED' },
    ]);
    expect(db.prepare('SELECT scope, retry_after_seconds FROM rate_limit_state').all()).toEqual([
      { scope: 'search', retry_after_seconds: 60000 },
    ]);
  });

  it('populates and reuses the normalized track alias cache', async () => {
    await setup();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        return new Response(
          JSON.stringify({
            tracks: {
              items: [
                {
                  id: 'abc123',
                  uri: 'spotify:track:abc123',
                  name: 'Example Song',
                  artists: [{ name: 'Example Artist' }],
                  album: { name: 'Example Album', release_date: '2020-01-01' },
                  duration_ms: 1234,
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const resolver = new TrackResolver(new SpotifyClient(auth));
    const first = await resolver.resolve({
      title: 'Example Song',
      artist: 'Example Artist',
      album: 'Example Album',
    });
    closeDatabase();
    initializeDatabase({ dataDir: root!, migrationsDir: join(process.cwd(), 'db/migrations') });
    const second = await resolver.resolve({
      title: 'EXAMPLE SONG',
      artist: 'Example Artist',
      album: 'Example Album',
    });
    expect(first).toMatchObject({
      status: 'matched',
      source: 'spotify_search',
      uri: 'spotify:track:abc123',
    });
    expect(second).toMatchObject({
      status: 'matched',
      source: 'database',
      uri: 'spotify:track:abc123',
    });
    expect(calls).toBe(1);
    expect(initializeDatabase().prepare('SELECT hit_count FROM track_aliases').get()).toEqual({
      hit_count: 1,
    });
  });

  it('coalesces concurrent identical uncached resolutions', async () => {
    await setup();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new Response(
          JSON.stringify({
            tracks: {
              items: [
                {
                  id: 'one',
                  uri: 'spotify:track:one',
                  name: 'Same Song',
                  artists: [{ name: 'Same Artist' }],
                },
              ],
            },
          }),
          { status: 200 },
        );
      }),
    );
    const resolver = new TrackResolver(new SpotifyClient(auth));
    await resolver.resolveMany(
      Array.from({ length: 100 }, () => ({ title: 'Same Song', artist: 'Same Artist' })),
    );
    expect(calls).toBe(1);
  });

  it('surfaces initialized database alias conflicts', async () => {
    await setup();
    const db = initializeDatabase();
    db.prepare(
      'INSERT INTO tracks (spotify_track_id,spotify_uri,title,artist,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    ).run(
      'old',
      'spotify:track:old',
      'Conflict Song',
      'Conflict Artist',
      'test',
      Date.now(),
      Date.now(),
    );
    const old = db.prepare('SELECT id FROM tracks WHERE spotify_track_id=?').get('old') as {
      id: number;
    };
    db.prepare(
      'INSERT INTO track_aliases (track_id,normalized_title,normalized_artist,created_at,updated_at) VALUES (?,?,?,?,?)',
    ).run(old.id, 'conflict song', 'conflict artist', Date.now(), Date.now());
    expect(() =>
      upsertTrackAndAlias(
        { title: 'conflict song', artist: 'conflict artist' },
        { id: 'new', uri: 'spotify:track:new', name: 'Conflict Song', artist: 'Conflict Artist' },
      ),
    ).toThrow('resolver_alias_conflict');
  });

  it('persists deferred dry-run completion without Spotify mutation', async () => {
    await setup();
    const jobId = createJob(
      'bulk_add_tracks',
      { phase: 'ready_to_commit', dry_run: true, strict: true, playlist_id: 'playlist' },
      [
        {
          title: 'Song',
          artist: 'Artist',
          resolution: { status: 'matched', uri: 'spotify:track:song' },
        },
      ],
    );
    updateJobItem(getJob(jobId, 0, 1).items[0].id, 'completed', {
      resolution: { status: 'matched', uri: 'spotify:track:song' },
    });
    const callbacks = new Map<string, (args: any) => Promise<any>>();
    registerAdvanced(
      {
        registerTool(name: string, _config: unknown, callback: (args: any) => Promise<any>) {
          callbacks.set(name, callback);
        },
      },
      {
        request: async () => ({ items: [] }),
        json: async () => {
          throw new Error('mutation');
        },
      } as any,
      true,
    );
    const result = await callbacks.get('commit_job')!({ job_id: jobId });
    expect(result.structuredContent).toMatchObject({
      job_id: jobId,
      job_status: 'completed',
      phase: 'completed',
      dry_run: true,
    });
    expect(getJob(jobId, 0, 1)).toMatchObject({
      status: 'completed',
      payload: { phase: 'completed', dry_run: true },
    });
  });
});
