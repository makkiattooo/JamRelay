import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, initializeDatabase } from '../src/db/database.js';
import { SpotifyClient } from '../src/spotify/client.js';
import { TrackResolver } from '../src/spotify/resolver.js';
import { recordRateLimit, upsertTrackAndAlias } from '../src/db/state.js';
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
  root = await mkdtemp(join(tmpdir(), 'jamrelay-runtime-'));
  initializeDatabase({ dataDir: root, migrationsDir: join(process.cwd(), 'db/migrations') });
}
const auth = { accessToken: async () => 'test-token' } as any;
const canonical = (id: string, title = 'Fallback Song', album = 'Fallback Album') => ({
  id,
  uri: `spotify:track:${id}`,
  name: title,
  artists: [{ name: 'Fallback Artist' }],
  album: { name: album, release_date: '2020-01-01' },
  duration_ms: 1000,
});

describe('persistent Spotify runtime state', () => {
  it('uses an alternate provider when persisted Spotify Search is blocked, verifies, caches, and survives restart', async () => {
    await setup();
    recordRateLimit('spotify', 'search', 600);
    const provider = {
      name: 'web_search',
      resolve: vi.fn(async () => [{ spotifyUrl: 'https://open.spotify.com/track/fallback' }]),
    };
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        paths.push(url);
        return new Response(JSON.stringify(canonical('fallback')), { status: 200 });
      }),
    );
    const resolver = new TrackResolver(new SpotifyClient(auth), provider);
    const first = await resolver.resolve({ title: 'Fallback Song', artist: 'Fallback Artist' });
    const second = await resolver.resolve({ title: 'Fallback Song', artist: 'Fallback Artist' });
    closeDatabase();
    initializeDatabase({ dataDir: root!, migrationsDir: join(process.cwd(), 'db/migrations') });
    const third = await resolver.resolve({ title: 'Fallback Song', artist: 'Fallback Artist' });
    expect(first).toMatchObject({ status: 'matched', source: 'external_verified', id: 'fallback' });
    expect(second).toMatchObject({ status: 'matched', source: 'database' });
    expect(third).toMatchObject({ status: 'matched', source: 'database' });
    expect(provider.resolve).toHaveBeenCalledTimes(1);
    expect(paths.some((x) => x.includes('/search'))).toBe(false);
    expect(paths.filter((x) => x.includes('/tracks/fallback'))).toHaveLength(1);
  });

  it('rejects mismatched and conflicting external candidates without aliases', async () => {
    await setup();
    recordRateLimit('spotify', 'search', 600);
    const provider = {
      name: 'web_search',
      resolve: vi.fn(async () => [
        { spotifyId: 'wrong' },
        { spotifyId: 'v1' },
        { spotifyId: 'v2' },
      ]),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const id = url.split('/tracks/')[1];
        const data =
          id === 'wrong'
            ? canonical(id, 'Other Song')
            : canonical(id, 'Fallback Song', id === 'v1' ? 'Album One' : 'Album Two');
        return new Response(JSON.stringify(data), { status: 200 });
      }),
    );
    const result = await new TrackResolver(new SpotifyClient(auth), provider).resolve({
      title: 'Fallback Song',
      artist: 'Fallback Artist',
    });
    expect(result).toMatchObject({ status: 'ambiguous', source: 'alternate_external' });
    expect(
      initializeDatabase()
        .prepare(
          "SELECT COUNT(*) as count FROM track_aliases WHERE normalized_title='fallback song' AND normalized_artist='fallback artist' AND normalized_album=''",
        )
        .get(),
    ).toEqual({ count: 0 });
  });

  it('remember_track verifies metadata without Search and preserves the manual attempt', async () => {
    await setup();
    recordRateLimit('spotify', 'search', 600);
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        paths.push(url);
        return new Response(JSON.stringify(canonical('manual')), { status: 200 });
      }),
    );
    const resolver = new TrackResolver(new SpotifyClient(auth), {
      name: 'unused',
      resolve: vi.fn(),
    });
    const result = await resolver.rememberTrack({
      track_id: 'spotify:track:manual',
      title: 'Fallback Song',
      artist: 'Fallback Artist',
      album: 'Fallback Album',
    });
    expect(result).toMatchObject({ status: 'matched', id: 'manual' });
    expect(paths.every((x) => !x.includes('/search'))).toBe(true);
    expect(
      initializeDatabase().prepare('SELECT strategy,status FROM resolver_attempts').all(),
    ).toContainEqual({ strategy: 'manual', status: 'matched' });
  });

  it('passively warms canonical tracks and safe album-less aliases from nested Spotify responses', async () => {
    await setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ items: [canonical('warm', 'Warm Song', 'Warm Album')] }), {
            status: 200,
          }),
      ),
    );
    const client = new SpotifyClient(auth);
    await client.request('/me/player/recently-played');
    const result = await new TrackResolver(client).resolve({
      title: 'Warm Song',
      artist: 'Fallback Artist',
    });
    expect(result).toMatchObject({ status: 'matched', source: 'database', id: 'warm' });
    expect(initializeDatabase().prepare('SELECT COUNT(*) as count FROM tracks').get()).toEqual({
      count: 1,
    });
    expect(
      initializeDatabase().prepare('SELECT COUNT(*) as count FROM track_aliases').get(),
    ).toEqual({ count: 2 });
  });
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
