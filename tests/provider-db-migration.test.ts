import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';
import {
  getTrackProviderMappings,
  listProviderConnections,
  upsertTrackProviderMapping,
} from '../src/db/state.js';

let roots: string[] = [];
afterEach(async () => {
  closeDatabase();
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

async function migrationFixture() {
  const root = await mkdtemp(join(tmpdir(), 'jamrelay-provider-db-'));
  roots.push(root);
  const oldDir = join(root, 'old-migrations');
  await mkdir(oldDir);
  for (const name of [
    '0001_state_db.sql',
    '0002_playlist_engine.sql',
    '0003_playlist_recipes.sql',
    '0004_personalization_history.sql',
  ])
    await writeFile(join(oldDir, name), await readFile(join(process.cwd(), 'db/migrations', name)));
  return { root, oldDir, migrationsDir: join(process.cwd(), 'db/migrations') };
}

describe('provider-aware state migration', () => {
  it('upgrades a populated 0001-0004 database and backfills legacy Spotify identity', async () => {
    const { root, oldDir, migrationsDir } = await migrationFixture();
    const old = initializeDatabase({ dataDir: root, migrationsDir: oldDir });
    old
      .prepare(
        'INSERT INTO tracks (spotify_track_id,spotify_uri,title,artist,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run('track-1', 'spotify:track:track-1', 'Song', 'Artist', 'test', 1, 1);
    old
      .prepare('INSERT INTO playlist_snapshots VALUES (?,?,?,?,?,?,?)')
      .run('snap-1', 'playlist-1', 'snapshot-1', '{}', 1, 'test', 1);
    old
      .prepare('INSERT INTO listening_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        'event-1',
        'track-1',
        'spotify:track:track-1',
        'Song',
        'Artist',
        null,
        2,
        'test',
        'played',
        null,
        null,
        null,
        '{}',
        2,
      );
    old
      .prepare(
        'INSERT INTO rotation_definitions (id,name,target_playlist_id,payload_json,cadence,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run('rotation-1', 'Rotation', 'playlist-1', '{}', 'daily', 1, 1);
    closeDatabase();

    const db = initializeDatabase({ dataDir: root, migrationsDir });
    expect(db.prepare('SELECT COUNT(*) count FROM track_provider_mappings').get()).toEqual({
      count: 1,
    });
    expect(
      db
        .prepare(
          'SELECT track_id,provider_id,connection_id,provider_track_id FROM track_provider_mappings',
        )
        .all(),
    ).toEqual([
      {
        track_id: 1,
        provider_id: 'spotify',
        connection_id: 'spotify-default',
        provider_track_id: 'track-1',
      },
    ]);
    expect(
      db.prepare('SELECT canonical_track_id,provider_id,connection_id FROM listening_events').get(),
    ).toEqual({
      canonical_track_id: 1,
      provider_id: 'spotify',
      connection_id: 'spotify-default',
    });
    expect(
      db
        .prepare('SELECT provider_id,connection_id,provider_snapshot_id FROM playlist_snapshots')
        .get(),
    ).toEqual({
      provider_id: 'spotify',
      connection_id: 'spotify-default',
      provider_snapshot_id: 'snapshot-1',
    });
    expect(
      db.prepare('SELECT target_provider_id,target_connection_id FROM rotation_definitions').get(),
    ).toEqual({
      target_provider_id: 'spotify',
      target_connection_id: 'spotify-default',
    });
    expect(listProviderConnections()).toHaveLength(1);
  });

  it('allows two provider mappings for one canonical track without storing credentials', async () => {
    const { root, migrationsDir } = await migrationFixture();
    const db = initializeDatabase({ dataDir: root, migrationsDir });
    db.prepare(
      'INSERT INTO tracks (spotify_track_id,spotify_uri,title,artist,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    ).run('canonical', 'spotify:track:canonical', 'Song', 'Artist', 'test', 1, 1);
    db.prepare(
      "INSERT INTO provider_connections (connection_id,provider_id,status,capabilities_json,created_at,updated_at) VALUES ('beta-main','beta','connected','{}',1,1)",
    ).run();
    upsertTrackProviderMapping({
      trackId: 1,
      providerId: 'spotify',
      connectionId: 'spotify-default',
      providerTrackId: 'canonical',
      providerUri: 'spotify:track:canonical',
    });
    upsertTrackProviderMapping({
      trackId: 1,
      providerId: 'beta',
      connectionId: 'beta-main',
      providerTrackId: 'beta-1',
      providerUrl: 'https://beta.example/track/beta-1',
    });
    expect(getTrackProviderMappings(1)).toHaveLength(2);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
      name: string;
    }>;
    expect(tables.some((table) => table.name === 'credentials')).toBe(false);
    expect(JSON.stringify(db.prepare('SELECT * FROM track_provider_mappings').all())).not.toContain(
      'token',
    );
  });
});
