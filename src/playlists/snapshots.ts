import { randomUUID } from 'node:crypto';
import { getDatabase, isDatabaseInitialized } from '../db/database.js';
export type PlaylistSnapshot = {
  id: string;
  playlistId: string;
  providerPlaylistId: string;
  providerId: string | null;
  connectionId: string | null;
  providerRevision: string | null;
  /** Legacy read alias; new callers must use providerRevision. */
  spotifySnapshotId: string | null;
  metadata: unknown;
  uris: string[];
  trackRefs: Array<{ providerTrackId?: string; providerUri?: string; providerUrl?: string }>;
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
  providerPlaylistId?: string;
  providerId?: string | null;
  connectionId?: string | null;
  providerRevision?: string | null;
  /** Legacy write alias accepted only for existing Spotify callers. */
  spotifySnapshotId?: string | null;
  metadata?: unknown;
  uris: string[];
  trackRefs?: Array<{ providerTrackId?: string; providerUri?: string; providerUrl?: string }>;
  reason?: string;
}): PlaylistSnapshot {
  const db = required(),
    id = `snap_${randomUUID()}`,
    now = Date.now();
  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO playlist_snapshots (id,playlist_id,spotify_snapshot_id,metadata_json,track_count,reason,created_at,provider_id,connection_id,provider_snapshot_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      id,
      input.providerPlaylistId ?? input.playlistId,
      input.providerRevision ?? input.spotifySnapshotId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.uris.length,
      input.reason ?? null,
      now,
      input.providerId ?? 'spotify',
      input.connectionId ?? 'spotify-default',
      input.providerRevision ?? input.spotifySnapshotId ?? null,
    );
    const stmt = db.prepare(
      'INSERT INTO playlist_snapshot_items (snapshot_id,position,uri,provider_track_id,provider_uri,provider_url) VALUES (?,?,?,?,?,?)',
    );
    input.uris.forEach((uri, position) => {
      const ref = input.trackRefs?.[position];
      stmt.run(
        id,
        position,
        uri,
        ref?.providerTrackId ?? null,
        ref?.providerUri ?? null,
        ref?.providerUrl ?? null,
      );
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return {
    id,
    playlistId: input.playlistId,
    providerPlaylistId: input.providerPlaylistId ?? input.playlistId,
    providerId: input.providerId ?? 'spotify',
    connectionId: input.connectionId ?? 'spotify-default',
    providerRevision: input.providerRevision ?? input.spotifySnapshotId ?? null,
    spotifySnapshotId: input.providerRevision ?? input.spotifySnapshotId ?? null,
    metadata: input.metadata ?? {},
    uris: input.uris,
    trackRefs: input.trackRefs ?? input.uris.map(() => ({})),
    trackCount: input.uris.length,
    reason: input.reason ?? null,
    createdAt: now,
  };
}
export function loadSnapshot(id: string): PlaylistSnapshot {
  const db = required(),
    row = db
      .prepare(
        'SELECT id, playlist_id playlistId, playlist_id providerPlaylistId, provider_id providerId, connection_id connectionId, COALESCE(provider_snapshot_id, spotify_snapshot_id) providerRevision, spotify_snapshot_id spotifySnapshotId, metadata_json metadata, track_count trackCount, reason, created_at createdAt FROM playlist_snapshots WHERE id=?',
      )
      .get(id) as any;
  if (!row)
    throw Object.assign(new Error('Playlist snapshot was not found.'), {
      code: 'snapshot_not_found',
    });
  const items = db
    .prepare(
      'SELECT uri,provider_track_id providerTrackId,provider_uri providerUri,provider_url providerUrl FROM playlist_snapshot_items WHERE snapshot_id=? ORDER BY position',
    )
    .all(id) as any[];
  return {
    ...row,
    providerId: row.providerId ?? 'spotify',
    connectionId: row.connectionId ?? 'spotify-default',
    metadata: JSON.parse(row.metadata),
    providerRevision: row.providerRevision ?? row.spotifySnapshotId ?? null,
    spotifySnapshotId: row.spotifySnapshotId ?? row.providerRevision ?? null,
    uris: items.map((x) => x.uri),
    trackRefs: items.map(({ providerTrackId, providerUri, providerUrl }) => ({
      providerTrackId,
      providerUri,
      providerUrl,
    })),
  };
}
export function latestOperation(
  playlistId: string,
  connectionId?: string,
  providerId?: string,
): any | null {
  const db = required();
  const row = db
    .prepare(
      "SELECT * FROM playlist_operations WHERE playlist_id=? AND status='completed' AND (? IS NULL OR connection_id=?) AND (? IS NULL OR provider_id=?) ORDER BY created_at DESC LIMIT 1",
    )
    .get(
      playlistId,
      connectionId ?? null,
      connectionId ?? null,
      providerId ?? null,
      providerId ?? null,
    ) as any;
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
  providerId?: string | null;
  connectionId?: string | null;
}) {
  required()
    .prepare(
      'INSERT INTO playlist_operations (id,playlist_id,operation,before_snapshot_id,after_snapshot_id,plan_json,status,created_at,provider_id,connection_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      input.id,
      input.playlistId,
      input.operation,
      input.beforeSnapshotId,
      input.afterSnapshotId ?? null,
      JSON.stringify(input.plan),
      input.status,
      Date.now(),
      input.providerId ?? 'spotify',
      input.connectionId ?? 'spotify-default',
    );
}
