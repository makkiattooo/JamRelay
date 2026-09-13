import { randomUUID } from 'node:crypto';
import { getDatabase, isDatabaseInitialized } from '../db/database.js';
export type PlaylistSnapshot = {
  id: string;
  playlistId: string;
  spotifySnapshotId: string | null;
  metadata: unknown;
  uris: string[];
  trackCount: number;
  reason: string | null;
  createdAt: number;
};
const required = () => {
  if (!isDatabaseInitialized())
    throw Object.assign(new Error('State database is required for playlist snapshots.'), {
      code: 'state_database_required',
    });
  return getDatabase();
};
export function saveSnapshot(input: {
  playlistId: string;
  spotifySnapshotId?: string | null;
  metadata?: unknown;
  uris: string[];
  reason?: string;
}): PlaylistSnapshot {
  const db = required(),
    id = `snap_${randomUUID()}`,
    now = Date.now();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO playlist_snapshots VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id,
      input.playlistId,
      input.spotifySnapshotId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.uris.length,
      input.reason ?? null,
      now,
    );
    const stmt = db.prepare('INSERT INTO playlist_snapshot_items VALUES (?, ?, ?)');
    input.uris.forEach((uri, position) => stmt.run(id, position, uri));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return {
    id,
    playlistId: input.playlistId,
    spotifySnapshotId: input.spotifySnapshotId ?? null,
    metadata: input.metadata ?? {},
    uris: input.uris,
    trackCount: input.uris.length,
    reason: input.reason ?? null,
    createdAt: now,
  };
}
export function loadSnapshot(id: string): PlaylistSnapshot {
  const db = required(),
    row = db
      .prepare(
        'SELECT id, playlist_id playlistId, spotify_snapshot_id spotifySnapshotId, metadata_json metadata, track_count trackCount, reason, created_at createdAt FROM playlist_snapshots WHERE id=?',
      )
      .get(id) as any;
  if (!row)
    throw Object.assign(new Error('Playlist snapshot was not found.'), {
      code: 'snapshot_not_found',
    });
  const items = db
    .prepare('SELECT uri FROM playlist_snapshot_items WHERE snapshot_id=? ORDER BY position')
    .all(id) as any[];
  return { ...row, metadata: JSON.parse(row.metadata), uris: items.map((x) => x.uri) };
}
export function latestOperation(playlistId: string): any | null {
  const db = required();
  const row = db
    .prepare(
      "SELECT * FROM playlist_operations WHERE playlist_id=? AND status='completed' ORDER BY created_at DESC LIMIT 1",
    )
    .get(playlistId) as any;
  return row ? { ...row, plan: JSON.parse(row.plan_json) } : null;
}
export function saveOperation(input: {
  id: string;
  playlistId: string;
  operation: string;
  beforeSnapshotId: string;
  afterSnapshotId?: string | null;
  plan: unknown;
  status: string;
}) {
  required()
    .prepare('INSERT INTO playlist_operations VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      input.id,
      input.playlistId,
      input.operation,
      input.beforeSnapshotId,
      input.afterSnapshotId ?? null,
      JSON.stringify(input.plan),
      input.status,
      Date.now(),
    );
}
