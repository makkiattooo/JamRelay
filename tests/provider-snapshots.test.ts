import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, initializeDatabase } from '../src/db/database.js';
import {
  latestOperation,
  loadSnapshot,
  saveOperation,
  saveSnapshot,
} from '../src/playlists/snapshots.js';

let roots: string[] = [];
afterEach(async () => {
  closeDatabase();
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

describe('provider-aware playlist snapshots', () => {
  it('keeps identical playlist IDs isolated by connection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jamrelay-snapshots-'));
    roots.push(root);
    initializeDatabase({ dataDir: root });
    const a = saveSnapshot({
      playlistId: 'same-id',
      providerId: 'alpha',
      connectionId: 'a',
      providerRevision: 'r-a',
      uris: ['alpha:track:1'],
      trackRefs: [{ providerTrackId: '1', providerUri: 'alpha:track:1' }],
    });
    const b = saveSnapshot({
      playlistId: 'same-id',
      providerId: 'beta',
      connectionId: 'b',
      providerRevision: 'r-b',
      uris: ['beta:track:1'],
      trackRefs: [{ providerTrackId: '1', providerUri: 'beta:track:1' }],
    });
    expect(loadSnapshot(a.id)).toMatchObject({
      playlistId: 'same-id',
      providerId: 'alpha',
      connectionId: 'a',
      providerRevision: 'r-a',
      uris: ['alpha:track:1'],
    });
    expect(loadSnapshot(b.id)).toMatchObject({
      playlistId: 'same-id',
      providerId: 'beta',
      connectionId: 'b',
      providerRevision: 'r-b',
      uris: ['beta:track:1'],
    });
  });

  it('reads a legacy Spotify snapshot and exposes the generic revision', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jamrelay-legacy-snapshot-'));
    roots.push(root);
    const db = initializeDatabase({ dataDir: root });
    db.prepare(
      'INSERT INTO playlist_snapshots (id,playlist_id,spotify_snapshot_id,metadata_json,track_count,reason,created_at) VALUES (?,?,?,?,?,?,?)',
    ).run('legacy', 'p1', 'legacy-rev', '{}', 1, 'legacy', 1);
    db.prepare('INSERT INTO playlist_snapshot_items (snapshot_id,position,uri) VALUES (?,?,?)').run(
      'legacy',
      0,
      'spotify:track:1',
    );
    const snapshot = loadSnapshot('legacy');
    expect(snapshot).toMatchObject({
      providerId: 'spotify',
      connectionId: 'spotify-default',
      providerRevision: 'legacy-rev',
      spotifySnapshotId: 'legacy-rev',
    });
  });

  it('scopes latest operations to the original connection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jamrelay-operation-scope-'));
    roots.push(root);
    initializeDatabase({ dataDir: root });
    const a = saveSnapshot({
      playlistId: 'same-id',
      providerId: 'alpha',
      connectionId: 'a',
      uris: [],
    });
    const b = saveSnapshot({
      playlistId: 'same-id',
      providerId: 'beta',
      connectionId: 'b',
      uris: [],
    });
    saveOperation({
      id: 'op-a',
      playlistId: 'same-id',
      operation: 'replace',
      beforeSnapshotId: a.id,
      plan: {},
      status: 'completed',
      providerId: 'alpha',
      connectionId: 'a',
    });
    saveOperation({
      id: 'op-b',
      playlistId: 'same-id',
      operation: 'replace',
      beforeSnapshotId: b.id,
      plan: {},
      status: 'completed',
      providerId: 'beta',
      connectionId: 'b',
    });
    expect(latestOperation('same-id', 'a', 'alpha').id).toBe('op-a');
    expect(latestOperation('same-id', 'b', 'beta').id).toBe('op-b');
  });
});
