import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, initializeDatabase } from '../src/db/database.js';
import { SpotifyClient } from '../src/spotify/client.js';
import { TrackResolver } from '../src/spotify/resolver.js';

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
});
