import { createHash } from 'node:crypto';
import { getDatabase, isDatabaseInitialized } from '../db/database.js';
import { findTrackProviderMapping, indexCanonicalTrack } from '../db/state.js';

export type ListeningEvent = {
  id: string;
  trackId: number | null;
  providerId: string;
  connectionId: string;
  providerTrackId: string;
  providerUri: string | null;
  spotifyTrackId: string;
  trackUri: string;
  title: string;
  artist: string;
  album?: string;
  occurredAt: number;
  source: string;
  eventType: string;
  sessionId?: string;
  progressMs?: number;
  durationMs?: number;
  evidence: Record<string, unknown>;
};
const db = () => {
  if (!isDatabaseInitialized())
    throw Object.assign(new Error('State database is required for local history.'), {
      code: 'state_database_required',
    });
  return getDatabase();
};
function resolveCanonical(
  providerId: string,
  connectionId: string,
  providerTrackId: string,
  item: any,
) {
  if (item?.canonicalTrackId) return Number(item.canonicalTrackId);
  const mapping = findTrackProviderMapping({ providerId, connectionId, providerTrackId });
  if (mapping) return mapping.trackId;
  if (providerId === 'spotify') {
    indexCanonicalTrack(item);
    return (
      (
        db().prepare('SELECT id FROM tracks WHERE spotify_track_id=?').get(providerTrackId) as
          { id: number } | undefined
      )?.id ?? null
    );
  }
  return null;
}
export function ingestPlayback(
  item: any,
  input: {
    occurredAt?: number;
    source: string;
    eventType?: string;
    progressMs?: number;
    sessionId?: string;
    evidence?: Record<string, unknown>;
    providerId?: string;
    connectionId?: string;
    providerTrackId?: string;
    providerUri?: string | null;
    canonicalTrackId?: number | null;
  },
): ListeningEvent | null {
  const providerTrackId = input.providerTrackId ?? item?.id;
  const providerUri = input.providerUri ?? item?.uri ?? item?.metadata?.providerUri ?? null;
  if (!providerTrackId || !item?.name) return null;
  const providerId = input.providerId ?? item?.providerId ?? 'spotify';
  const connectionId = input.connectionId ?? item?.connectionId ?? 'spotify-default';
  const occurredAt = input.occurredAt ?? Date.now(),
    eventType = input.eventType ?? 'played';
  const id = createHash('sha256')
    .update(
      [providerId, connectionId, providerTrackId, occurredAt, input.source, eventType].join('\0'),
    )
    .digest('hex');
  const trackId =
    input.canonicalTrackId === undefined
      ? resolveCanonical(providerId, connectionId, providerTrackId, item)
      : input.canonicalTrackId;
  const evidence = { ...(input.evidence ?? {}) };
  if (trackId == null) evidence.canonical_unresolved = true;
  const event: ListeningEvent = {
    id,
    trackId: trackId ?? null,
    providerId,
    connectionId,
    providerTrackId,
    providerUri,
    spotifyTrackId: providerTrackId,
    trackUri: providerUri ?? '',
    title: item.name,
    artist: (item.artists ?? [])
      .map((a: any) => a.name)
      .filter(Boolean)
      .join(', '),
    album: item.album?.name ?? null,
    occurredAt,
    source: input.source,
    eventType,
    sessionId: input.sessionId ?? undefined,
    progressMs: input.progressMs,
    durationMs: item.duration_ms ?? item.metadata?.durationMs ?? undefined,
    evidence,
  };
  const params: any[] = [
    event.id,
    event.spotifyTrackId,
    event.trackUri,
    event.title,
    event.artist,
    event.album ?? null,
    event.occurredAt,
    event.source,
    event.eventType,
    event.sessionId ?? null,
    event.progressMs ?? null,
    event.durationMs ?? null,
    JSON.stringify(event.evidence),
    Date.now(),
    event.trackId,
    event.providerId,
    event.connectionId,
    event.providerTrackId,
    event.providerUri,
  ];
  db()
    .prepare(
      `INSERT OR IGNORE INTO listening_events
    (id,spotify_track_id,track_uri,title,artist,album,occurred_at,source,event_type,session_id,progress_ms,duration_ms,evidence_json,created_at,canonical_track_id,provider_id,connection_id,provider_track_id,provider_uri)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(...params);
  return event;
}
export function listHistory(input: {
  since?: number;
  until?: number;
  limit?: number;
  artist?: string;
  track?: string;
  source?: string;
}) {
  const where = ['1=1'],
    args: any[] = [];
  if (input.since) {
    where.push('occurred_at>=?');
    args.push(input.since);
  }
  if (input.until) {
    where.push('occurred_at<=?');
    args.push(input.until);
  }
  if (input.artist) {
    where.push('lower(artist) LIKE ?');
    args.push('%' + input.artist.toLowerCase() + '%');
  }
  if (input.track) {
    where.push('(spotify_track_id=? OR provider_track_id=? OR lower(title) LIKE ?)');
    args.push(input.track, input.track, '%' + input.track.toLowerCase() + '%');
  }
  if (input.source) {
    where.push('source=?');
    args.push(input.source);
  }
  args.push(Math.min(1000, input.limit ?? 100));
  return (
    db()
      .prepare(
        `SELECT id,canonical_track_id trackId,provider_id providerId,connection_id connectionId,provider_track_id providerTrackId,provider_uri providerUri,spotify_track_id spotifyTrackId,track_uri trackUri,title,artist,album,occurred_at occurredAt,source,event_type eventType,session_id sessionId,progress_ms progressMs,duration_ms durationMs,evidence_json evidence FROM listening_events WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC LIMIT ?`,
      )
      .all(...args) as any[]
  ).map((x) => ({ ...x, trackId: x.trackId ?? null, evidence: JSON.parse(x.evidence) }));
}
export function historyStats(trackIds: Array<string | number>) {
  if (!trackIds.length) return new Map<string | number, any>();
  const canonicalFor = new Map<string, number>();
  for (const ref of trackIds) {
    if (typeof ref === 'number') canonicalFor.set(String(ref), ref);
    else {
      const mapping = findTrackProviderMapping({ providerTrackId: ref });
      if (mapping) canonicalFor.set(String(ref), mapping.trackId);
    }
  }
  const canonicalIds = [...new Set([...canonicalFor.values()])];
  const canonicalMarks = canonicalIds.map(() => '?').join(',') || 'NULL';
  const refMarks = trackIds.map(() => '?').join(',');
  const rows = db()
    .prepare(
      `SELECT canonical_track_id canonicalId,provider_track_id providerTrackId,spotify_track_id legacyId,COUNT(*) plays,MAX(occurred_at) lastPlayed FROM listening_events WHERE canonical_track_id IN (${canonicalMarks}) OR provider_track_id IN (${refMarks}) OR spotify_track_id IN (${refMarks}) GROUP BY canonical_track_id,provider_track_id,spotify_track_id`,
    )
    .all(...canonicalIds, ...trackIds, ...trackIds) as any[];
  const out = new Map<string | number, any>();
  for (const row of rows) {
    const requested = [
      ...new Set(
        trackIds.filter(
          (x) =>
            [row.canonicalId, row.providerTrackId, row.legacyId].some(
              (key) => key != null && String(x) === String(key),
            ) ||
            (row.canonicalId != null && canonicalFor.get(String(x)) === row.canonicalId),
        ),
      ),
    ];
    for (const requestedKey of requested) {
      const old = out.get(requestedKey),
        value = { ...row, id: requestedKey };
      out.set(
        requestedKey,
        old
          ? {
              ...value,
              plays: old.plays + value.plays,
              lastPlayed: Math.max(old.lastPlayed, value.lastPlayed),
            }
          : value,
      );
    }
  }
  return out;
}
export function stableSeed(value: string) {
  return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16);
}
