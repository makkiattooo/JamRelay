import { toolContext } from '../src/mcp/context.js';
import { registerPlaylistPersonalizationTools } from '../src/playlists/personalization.js';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, initializeDatabase, getDatabase } from '../src/db/database.js';
import { upsertTrackProviderMapping } from '../src/db/state.js';
import { historyStats, ingestPlayback, listHistory } from '../src/playlists/history.js';
import { normalizePlaylistTrack } from '../src/playlists/normalize.js';
import { rankTracks } from '../src/playlists/affinity.js';

let root = '';
afterEach(async () => {
  closeDatabase();
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});
async function setup() {
  root = await mkdtemp(join(tmpdir(), 'jamrelay-personalization-'));
  initializeDatabase({ dataDir: root, migrationsDir: join(process.cwd(), 'db/migrations') });
  const db = getDatabase();
  db.prepare(
    'INSERT INTO tracks (spotify_track_id,spotify_uri,title,artist,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
  ).run(
    'canonical-spotify',
    'spotify:track:canonical-spotify',
    'Shared Song',
    'Artist',
    'test',
    1,
    1,
  );
  db.prepare(
    "INSERT INTO provider_connections (connection_id,provider_id,status,capabilities_json,created_at,updated_at) VALUES ('beta-main','beta','connected','{}',1,1)",
  ).run();
  upsertTrackProviderMapping({
    trackId: 1,
    providerId: 'spotify',
    connectionId: 'spotify-default',
    providerTrackId: 'spotify-1',
    providerUri: 'spotify:track:spotify-1',
  });
  upsertTrackProviderMapping({
    trackId: 1,
    providerId: 'beta',
    connectionId: 'beta-main',
    providerTrackId: 'beta-1',
    providerUri: 'beta:track:beta-1',
    evidence: { match: 'isrc' },
  });
}

describe('provider-aware personalization history', () => {
  it('uses one canonical affinity for plays observed on two providers', async () => {
    await setup();
    ingestPlayback(
      {
        id: 'spotify-1',
        uri: 'spotify:track:spotify-1',
        name: 'Shared Song',
        artists: [{ name: 'Artist' }],
      },
      {
        source: 'spotify_sync',
        providerId: 'spotify',
        connectionId: 'spotify-default',
        occurredAt: 100,
      },
    );
    ingestPlayback(
      {
        id: 'beta-1',
        uri: 'beta:track:beta-1',
        name: 'Shared Song',
        artists: [{ name: 'Artist' }],
      },
      { source: 'beta_sync', providerId: 'beta', connectionId: 'beta-main', occurredAt: 200 },
    );
    expect(listHistory({ limit: 10 }).map((x) => [x.trackId, x.providerId])).toEqual([
      [1, 'beta'],
      [1, 'spotify'],
    ]);
    expect(historyStats(['spotify-1']).get('spotify-1').plays).toBe(2);
    expect(historyStats(['beta-1']).get('beta-1').plays).toBe(2);
    await toolContext.run(
      {
        requestId: 'isolated-history',
        signal: new AbortController().signal,
        deadlineAt: Date.now() + 1000,
        mcpAccess: { clientId: 'client-a', connectionIds: ['spotify-default'] },
      },
      async () => {
        expect(listHistory({}).map((e) => e.connectionId)).toEqual(['spotify-default']);
        expect(historyStats(['spotify-1']).get('spotify-1').plays).toBe(1);
      },
    );
  });

  it('avoids a recently played track through a provider mapping and retains low-data evidence', async () => {
    await setup();
    ingestPlayback(
      {
        id: 'beta-1',
        name: 'Shared Song',
        metadata: { providerUri: 'beta:track:beta-1' },
        artists: [{ name: 'Artist' }],
      },
      {
        source: 'beta_sync',
        providerId: 'beta',
        connectionId: 'beta-main',
        occurredAt: Date.now(),
      },
    );
    const track = normalizePlaylistTrack(
      {
        type: 'track',
        id: 'spotify-1',
        uri: 'spotify:track:spotify-1',
        name: 'Shared Song',
        artists: [{ name: 'Artist' }],
      },
      0,
    )!;
    expect(historyStats([track.id!]).has('spotify-1')).toBe(true);
    const fresh = normalizePlaylistTrack(
      {
        type: 'track',
        id: 'unmapped',
        uri: 'beta:track:unmapped',
        name: 'Unknown',
        artists: [{ name: 'Other' }],
      },
      0,
    )!;
    expect(rankTracks([fresh])[0].evidence).toEqual(['no local playback evidence']);
  });

  it('does not import SpotifyClient in the personalization module', async () => {
    const source = await readFile(join(process.cwd(), 'src/playlists/personalization.ts'), 'utf8');
    expect(source).not.toContain('SpotifyClient');
  });

  it('does not import SpotifyClient in the generic automation module', async () => {
    const source = await readFile(
      new URL('../src/playlists/automation.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('SpotifyClient');
  });
});

it('executes personalization writes and verifies resulting provider state instead of returning a simulated success', async () => {
  await setup();
  const tools = new Map<string, (args: any) => Promise<any>>();
  let ids = ['one', 'two'];
  let writes = 0;
  const gateway: any = {
    resolveReadTarget: () => ({
      summary: { provider: 'beta', connectionId: 'beta-main' },
      playlistRead: {},
    }),
    get: async () => ({ name: 'Fixture', snapshot_id: String(writes) }),
    items: async () => ({
      items: ids.map((id) => ({
        item: {
          id,
          name: id,
          uri: 'beta:track:' + id,
          type: 'track',
          artists: [{ name: 'Artist' }],
        },
      })),
    }),
    replace: async (_playlist: string, next: string[]) => {
      writes++;
      ids = next;
    },
  };
  registerPlaylistPersonalizationTools(
    { registerTool: (name: string, _config: unknown, callback: any) => tools.set(name, callback) },
    gateway,
  );
  const result = await tools.get('personalize_playlist')!({
    playlist_id: 'fixture-playlist',
    dry_run: false,
    min_artist_gap: 0,
    seed: 1,
  });
  expect(writes).toBe(1);
  expect(result.structuredContent.verification).toEqual({ ok: true, count: 2 });
  gateway.replace = async () => {
    writes++;
    ids = [];
  };
  await expect(
    tools.get('sort_by_personal_affinity')!({ playlist_id: 'fixture-playlist', dry_run: false }),
  ).rejects.toThrow('playlist_integrity_mismatch');
});
