import { createHash, randomUUID } from 'node:crypto';
import { getDatabase, isDatabaseInitialized } from '../db/database.js';
import { indexCanonicalTrack } from '../db/state.js';
export type ListeningEvent = {
  id: string;
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
export function ingestPlayback(
  item: any,
  input: {
    occurredAt?: number;
    source: string;
    eventType?: string;
    progressMs?: number;
    sessionId?: string;
    evidence?: Record<string, unknown>;
  },
): ListeningEvent | null {
  if (!item?.id || !item?.uri || !item?.name) return null;
  indexCanonicalTrack(item);
  const occurredAt = input.occurredAt ?? Date.now(),
    eventType = input.eventType ?? 'played',
    id = createHash('sha256')
      .update([item.id, occurredAt, input.source, eventType].join('\0'))
      .digest('hex');
  const event = {
    id,
    spotifyTrackId: item.id,
    trackUri: item.uri,
    title: item.name,
    artist: (item.artists ?? []).map((a: any) => a.name).join(', '),
    album: item.album?.name ?? null,
    occurredAt,
    source: input.source,
    eventType,
    sessionId: input.sessionId ?? null,
    progressMs: input.progressMs ?? null,
    durationMs: item.duration_ms ?? null,
    evidence: input.evidence ?? {},
  };
  db()
    .prepare(
      'INSERT OR IGNORE INTO listening_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      event.id,
      event.spotifyTrackId,
      event.trackUri,
      event.title,
      event.artist,
      event.album,
      event.occurredAt,
      event.source,
      event.eventType,
      event.sessionId,
      event.progressMs,
      event.durationMs,
      JSON.stringify(event.evidence),
      Date.now(),
    );
  return event as ListeningEvent;
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
    where.push('(spotify_track_id=? OR lower(title) LIKE ?)');
    args.push(input.track, '%' + input.track.toLowerCase() + '%');
  }
  if (input.source) {
    where.push('source=?');
    args.push(input.source);
  }
  args.push(Math.min(1000, input.limit ?? 100));
  return (
    db()
      .prepare(
        `SELECT id,spotify_track_id spotifyTrackId,track_uri trackUri,title,artist,album,occurred_at occurredAt,source,event_type eventType,session_id sessionId,progress_ms progressMs,duration_ms durationMs,evidence_json evidence FROM listening_events WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC LIMIT ?`,
      )
      .all(...args) as any[]
  ).map((x) => ({ ...x, evidence: JSON.parse(x.evidence) }));
}
export function historyStats(trackIds: string[]) {
  if (!trackIds.length) return new Map<string, any>();
  const marks = trackIds.map(() => '?').join(',');
  const rows = db()
    .prepare(
      `SELECT spotify_track_id id,COUNT(*) plays,MAX(occurred_at) lastPlayed FROM listening_events WHERE spotify_track_id IN (${marks}) GROUP BY spotify_track_id`,
    )
    .all(...trackIds) as any[];
  return new Map(rows.map((x) => [x.id, x]));
}
export function stableSeed(value: string) {
  return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16);
}
