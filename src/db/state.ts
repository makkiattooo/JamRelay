import { createHash } from 'node:crypto';
import { getDatabase } from './database.js';
import { normalizeText } from '../music/normalize.js';

export type ApiErrorRecord = {
  id: number;
  fingerprint: string;
  provider: string;
  endpoint: string;
  method: string;
  statusCode: number | null;
  reason: string | null;
  message: string | null;
  retryAfterSeconds: number | null;
};

const bounded = (value: string | undefined, max = 500) => value?.slice(0, max) || null;
const endpointOf = (endpoint: string) => {
  try {
    return new URL(endpoint, 'https://spotify.invalid').pathname || '/';
  } catch {
    return endpoint.split('?')[0] || '/';
  }
};

export function apiErrorFingerprint(
  provider: string,
  method: string,
  endpoint: string,
  status: number | undefined,
  reason?: string,
  connectionId?: string,
) {
  return createHash('sha256')
    .update(
      [
        provider.toLowerCase(),
        method.toUpperCase(),
        endpointOf(endpoint),
        status ?? '',
        reason ?? '',
        connectionId ?? 'default',
      ].join('\n'),
    )
    .digest('hex');
}

export function recordApiError(input: {
  provider: string;
  endpoint: string;
  method: string;
  statusCode?: number;
  reason?: string;
  message?: string;
  retryAfterSeconds?: number;
  requestId?: string;
  operation?: string;
  payloadHash?: string;
  connectionId?: string;
}): ApiErrorRecord | null {
  try {
    const db = getDatabase();
    const fingerprint = apiErrorFingerprint(
      input.provider,
      input.method,
      input.endpoint,
      input.statusCode,
      input.reason,
      input.connectionId,
    );
    const now = Date.now();
    db.prepare(
      `INSERT INTO api_errors
      (fingerprint, provider, endpoint, method, status_code, reason, message, retry_after_seconds,
       request_id, operation, payload_hash, first_seen_at, last_seen_at, occurrences, resolved_at, connection_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET
        last_seen_at=excluded.last_seen_at, occurrences=api_errors.occurrences+1,
        retry_after_seconds=COALESCE(excluded.retry_after_seconds, api_errors.retry_after_seconds),
        request_id=COALESCE(excluded.request_id, api_errors.request_id),
        message=COALESCE(excluded.message, api_errors.message), resolved_at=NULL`,
    ).run(
      fingerprint,
      input.provider,
      endpointOf(input.endpoint),
      input.method.toUpperCase(),
      input.statusCode ?? null,
      bounded(input.reason),
      bounded(input.message),
      input.retryAfterSeconds ?? null,
      bounded(input.requestId, 200),
      bounded(input.operation, 200),
      bounded(input.payloadHash, 128),
      now,
      now,
      input.connectionId ?? 'default',
    );
    return db
      .prepare(
        'SELECT id, fingerprint, provider, connection_id connectionId, endpoint, method, status_code as statusCode, reason, message, retry_after_seconds as retryAfterSeconds FROM api_errors WHERE fingerprint=?',
      )
      .get(fingerprint) as ApiErrorRecord;
  } catch {
    return null;
  }
}

export function recordRateLimit(
  provider: string,
  scope: string,
  retryAfterSeconds: number,
  reason?: string,
  connectionId = 'default',
): void {
  try {
    const now = Date.now();
    getDatabase()
      .prepare(
        `INSERT INTO rate_limit_state (provider, connection_id, scope, blocked_until, retry_after_seconds, reason, last_status_code, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 429, ?)
      ON CONFLICT(provider, connection_id, scope) DO UPDATE SET blocked_until=excluded.blocked_until,
      retry_after_seconds=excluded.retry_after_seconds, reason=excluded.reason, last_status_code=429, updated_at=excluded.updated_at`,
      )
      .run(
        provider,
        connectionId,
        scope,
        now + Math.max(0, retryAfterSeconds) * 1000,
        retryAfterSeconds,
        bounded(reason, 200),
        now,
      );
  } catch {
    /* DB is optional for unit-test clients. */
  }
}

export function getRateLimit(provider: string, scope: string, connectionId = 'default') {
  try {
    const row = getDatabase()
      .prepare(
        'SELECT provider, connection_id connectionId, scope, blocked_until as blockedUntil, retry_after_seconds as retryAfterSeconds, reason, last_status_code as lastStatusCode FROM rate_limit_state WHERE provider=? AND connection_id=? AND scope=?',
      )
      .get(provider, connectionId, scope) as
      | {
          blockedUntil: number | null;
          retryAfterSeconds: number | null;
          reason: string | null;
          lastStatusCode: number | null;
        }
      | undefined;
    if (!row || row.blockedUntil === null || row.blockedUntil <= Date.now()) return null;
    return row;
  } catch {
    return null;
  }
}

export function clearRateLimit(provider: string, scope: string, connectionId = 'default'): void {
  try {
    getDatabase()
      .prepare(
        'UPDATE rate_limit_state SET blocked_until=NULL, retry_after_seconds=NULL, updated_at=? WHERE provider=? AND connection_id=? AND scope=?',
      )
      .run(Date.now(), provider, connectionId, scope);
  } catch {
    /* optional DB */
  }
}

export function getRateLimitStatus(provider = 'spotify', scope?: string, connectionId = 'default') {
  const rows = getDatabase()
    .prepare(
      `SELECT provider, connection_id connectionId, scope, blocked_until as blockedUntil, retry_after_seconds as retryAfterSeconds, reason, last_status_code as lastStatusCode, updated_at as updatedAt FROM rate_limit_state ${scope ? 'WHERE provider=? AND connection_id=? AND scope=?' : 'WHERE provider=? AND connection_id=?'} ORDER BY scope`,
    )
    .all(...(scope ? [provider, connectionId, scope] : [provider, connectionId])) as Array<{
    provider: string;
    connectionId: string;
    scope: string;
    blockedUntil: number | null;
    retryAfterSeconds: number | null;
    reason: string | null;
    lastStatusCode: number | null;
    updatedAt: number;
  }>;
  return rows.map((row) => ({
    provider: row.provider,
    connection_id: row.connectionId,
    scope: row.scope,
    blocked: row.blockedUntil !== null && row.blockedUntil > Date.now(),
    blocked_until: row.blockedUntil,
    remaining_seconds: row.blockedUntil
      ? Math.max(0, Math.ceil((row.blockedUntil - Date.now()) / 1000))
      : 0,
    reason: row.reason,
    last_status_code: row.lastStatusCode,
    updated_at: row.updatedAt,
  }));
}

export function getRecentApiErrors(
  limit = 25,
  provider?: string,
  statusCode?: number,
  unresolvedOnly = false,
  connectionId?: string,
) {
  const conditions = ['1=1'];
  const args: (string | number)[] = [];
  if (provider) {
    conditions.push('provider=?');
    args.push(provider);
  }
  if (statusCode !== undefined) {
    conditions.push('status_code=?');
    args.push(statusCode);
  }
  if (connectionId) {
    conditions.push('connection_id=?');
    args.push(connectionId);
  }
  if (unresolvedOnly) conditions.push('resolved_at IS NULL');
  args.push(Math.min(100, Math.max(1, limit)));
  return getDatabase()
    .prepare(
      `SELECT id,fingerprint,provider,connection_id connectionId,endpoint,method,status_code as statusCode,reason,message,retry_after_seconds as retryAfterSeconds,operation,first_seen_at as firstSeenAt,last_seen_at as lastSeenAt,occurrences,resolved_at as resolvedAt FROM api_errors WHERE ${conditions.join(' AND ')} ORDER BY last_seen_at DESC LIMIT ?`,
    )
    .all(...args);
}

export type TrackQuery = { title: string; artist: string; album?: string; year?: number };
export type ProviderConnectionRecord = {
  connectionId: string;
  providerId: string;
  accountId: string | null;
  displayLabel: string | null;
  status: string;
  capabilities: unknown;
  createdAt: number;
  updatedAt: number;
};
export type TrackProviderMappingRecord = {
  id: number;
  trackId: number;
  providerId: string;
  connectionId: string;
  providerTrackId: string;
  providerUri: string | null;
  providerUrl: string | null;
  isrc: string | null;
  availability: string | null;
  metadata: unknown;
  evidence: unknown;
  verifiedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export function upsertProviderConnection(input: {
  connectionId: string;
  providerId: string;
  accountId?: string | null;
  displayLabel?: string | null;
  status?: string;
  capabilities?: unknown;
}): ProviderConnectionRecord {
  const db = getDatabase();
  const now = Date.now();
  db.prepare(
    `INSERT INTO provider_connections
      (connection_id, provider_id, account_id, display_label, status, capabilities_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(connection_id) DO UPDATE SET provider_id=excluded.provider_id,
      account_id=excluded.account_id, display_label=excluded.display_label, status=excluded.status,
      capabilities_json=excluded.capabilities_json, updated_at=excluded.updated_at`,
  ).run(
    input.connectionId,
    input.providerId,
    input.accountId ?? null,
    input.displayLabel ?? null,
    input.status ?? 'unknown',
    JSON.stringify(input.capabilities ?? {}),
    now,
    now,
  );
  return getProviderConnection(input.connectionId)!;
}

export function getProviderConnection(connectionId: string): ProviderConnectionRecord | null {
  const row = getDatabase()
    .prepare(
      `SELECT connection_id connectionId, provider_id providerId, account_id accountId,
        display_label displayLabel, status, capabilities_json capabilities, created_at createdAt,
        updated_at updatedAt FROM provider_connections WHERE connection_id=?`,
    )
    .get(connectionId) as
    (Omit<ProviderConnectionRecord, 'capabilities'> & { capabilities: string }) | undefined;
  return row ? { ...row, capabilities: JSON.parse(row.capabilities) } : null;
}

export function listProviderConnections(): ProviderConnectionRecord[] {
  return (
    getDatabase()
      .prepare(
        `SELECT connection_id connectionId, provider_id providerId, account_id accountId,
        display_label displayLabel, status, capabilities_json capabilities, created_at createdAt,
        updated_at updatedAt FROM provider_connections ORDER BY connection_id`,
      )
      .all() as Array<Omit<ProviderConnectionRecord, 'capabilities'> & { capabilities: string }>
  ).map((row) => ({ ...row, capabilities: JSON.parse(row.capabilities) }));
}

export function upsertTrackProviderMapping(input: {
  trackId: number;
  providerId: string;
  connectionId: string;
  providerTrackId: string;
  providerUri?: string | null;
  providerUrl?: string | null;
  isrc?: string | null;
  availability?: string | null;
  metadata?: unknown;
  evidence?: unknown;
  verifiedAt?: number | null;
}): TrackProviderMappingRecord {
  const now = Date.now();
  getDatabase()
    .prepare(
      `INSERT INTO track_provider_mappings
        (track_id, provider_id, connection_id, provider_track_id, provider_uri, provider_url, isrc,
         availability, metadata_json, evidence_json, verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(connection_id, provider_track_id) DO UPDATE SET track_id=excluded.track_id,
        provider_id=excluded.provider_id, provider_uri=excluded.provider_uri, provider_url=excluded.provider_url,
        isrc=excluded.isrc, availability=excluded.availability, metadata_json=excluded.metadata_json,
        evidence_json=excluded.evidence_json, verified_at=excluded.verified_at, updated_at=excluded.updated_at`,
    )
    .run(
      input.trackId,
      input.providerId,
      input.connectionId,
      input.providerTrackId,
      input.providerUri ?? null,
      input.providerUrl ?? null,
      input.isrc ?? null,
      input.availability ?? null,
      JSON.stringify(input.metadata ?? {}),
      JSON.stringify(input.evidence ?? {}),
      input.verifiedAt ?? null,
      now,
      now,
    );
  return getTrackProviderMappings(input.trackId).find(
    (mapping) =>
      mapping.connectionId === input.connectionId &&
      mapping.providerTrackId === input.providerTrackId,
  )!;
}

export function getTrackProviderMappings(trackId: number): TrackProviderMappingRecord[] {
  return (
    getDatabase()
      .prepare(
        `SELECT id, track_id trackId, provider_id providerId, connection_id connectionId,
        provider_track_id providerTrackId, provider_uri providerUri, provider_url providerUrl, isrc,
        availability, metadata_json metadata, evidence_json evidence, verified_at verifiedAt,
        created_at createdAt, updated_at updatedAt FROM track_provider_mappings WHERE track_id=?
        ORDER BY provider_id, connection_id, provider_track_id`,
      )
      .all(trackId) as Array<TrackProviderMappingRecord & { metadata: string; evidence: string }>
  ).map((row) => ({
    ...row,
    metadata: JSON.parse(row.metadata),
    evidence: JSON.parse(row.evidence),
  }));
}

export function findTrackProviderMapping(input: {
  providerId?: string;
  connectionId?: string;
  providerTrackId: string;
}): TrackProviderMappingRecord | null {
  const row = getDatabase()
    .prepare(
      `SELECT id, track_id trackId, provider_id providerId, connection_id connectionId,
     provider_track_id providerTrackId, provider_uri providerUri, provider_url providerUrl, isrc,
     availability, metadata_json metadata, evidence_json evidence, verified_at verifiedAt,
     created_at createdAt, updated_at updatedAt FROM track_provider_mappings
     WHERE provider_track_id=? AND (? IS NULL OR provider_id=?) AND (? IS NULL OR connection_id=?)
     ORDER BY verified_at DESC NULLS LAST, id DESC LIMIT 1`,
    )
    .get(
      input.providerTrackId,
      input.providerId ?? null,
      input.providerId ?? null,
      input.connectionId ?? null,
      input.connectionId ?? null,
    ) as (TrackProviderMappingRecord & { metadata: string; evidence: string }) | undefined;
  return row
    ? { ...row, metadata: JSON.parse(row.metadata), evidence: JSON.parse(row.evidence) }
    : null;
}

export type CachedTrack = {
  id: number;
  spotifyTrackId: string;
  spotifyUri: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
};
export const trackKey = (q: TrackQuery) => [q.title, q.artist, q.album ?? ''].join('\u0000');

export function findCachedTrack(q: TrackQuery): CachedTrack | null {
  try {
    const db = getDatabase();
    const row = db
      .prepare(
        `SELECT t.id, t.spotify_track_id as spotifyTrackId, t.spotify_uri as spotifyUri, t.title, t.artist, t.album, t.duration_ms as durationMs
      FROM track_aliases a JOIN tracks t ON t.id=a.track_id WHERE a.normalized_title=? AND a.normalized_artist=? AND a.normalized_album=?`,
      )
      .get(q.title, q.artist, q.album ?? '') as CachedTrack | undefined;
    if (!row) return null;
    db.prepare(
      'UPDATE track_aliases SET hit_count=hit_count+1, last_used_at=?, updated_at=? WHERE normalized_title=? AND normalized_artist=? AND normalized_album=?',
    ).run(Date.now(), Date.now(), q.title, q.artist, q.album ?? '');
    return row;
  } catch {
    return null;
  }
}

export function upsertTrackAndAlias(
  query: TrackQuery,
  match: {
    id: string;
    uri: string;
    name: string;
    artist: string;
    album?: string;
    durationMs?: number | null;
    confidence?: number | null;
  },
  source = 'spotify_search',
) {
  const db = getDatabase();
  const now = Date.now();
  const existing = db
    .prepare('SELECT id, spotify_track_id as spotifyTrackId FROM tracks WHERE spotify_track_id=?')
    .get(match.id) as { id: number; spotifyTrackId: string } | undefined;
  let trackId: number;
  if (existing) {
    trackId = existing.id;
    db.prepare(
      'UPDATE tracks SET spotify_uri=?, title=?, artist=?, album=?, duration_ms=?, source=?, confidence=?, verified_at=?, updated_at=? WHERE id=?',
    ).run(
      match.uri,
      match.name,
      match.artist,
      match.album ?? null,
      match.durationMs ?? null,
      source,
      match.confidence ?? null,
      now,
      now,
      trackId,
    );
  } else {
    const result = db
      .prepare(
        'INSERT INTO tracks (spotify_track_id, spotify_uri, title, artist, album, duration_ms, source, confidence, verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        match.id,
        match.uri,
        match.name,
        match.artist,
        match.album ?? null,
        match.durationMs ?? null,
        source,
        match.confidence ?? null,
        now,
        now,
        now,
      );
    trackId = Number(result.lastInsertRowid);
  }
  const alias = db
    .prepare(
      'SELECT track_id as trackId FROM track_aliases WHERE normalized_title=? AND normalized_artist=? AND normalized_album=?',
    )
    .get(query.title, query.artist, query.album ?? '') as { trackId: number } | undefined;
  if (alias && alias.trackId !== trackId) throw new Error('resolver_alias_conflict');
  db.prepare(
    `INSERT INTO track_aliases (track_id, normalized_title, normalized_artist, normalized_album, hit_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?) ON CONFLICT(normalized_title, normalized_artist, normalized_album) DO UPDATE SET updated_at=excluded.updated_at`,
  ).run(trackId, query.title, query.artist, query.album ?? '', now, now);
  return trackId;
}

export function indexCanonicalTrack(match: {
  id?: string;
  uri?: string;
  name?: string;
  artists?: Array<{ name?: string }>;
  album?: { name?: string };
  duration_ms?: number;
}) {
  if (!match.id || !match.uri || !match.name || !match.artists?.length) return;
  try {
    const db = getDatabase();
    const now = Date.now();
    const artist = match.artists
      .map((x) => x.name)
      .filter(Boolean)
      .join(', ');
    db.prepare(
      `INSERT INTO tracks (spotify_track_id,spotify_uri,title,artist,album,duration_ms,source,confidence,verified_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?, 'spotify_response', NULL, ?, ?, ?)
      ON CONFLICT(spotify_track_id) DO UPDATE SET spotify_uri=excluded.spotify_uri,title=excluded.title,artist=excluded.artist,album=excluded.album,duration_ms=excluded.duration_ms,updated_at=excluded.updated_at`,
    ).run(
      match.id,
      match.uri,
      match.name,
      artist,
      match.album?.name ?? null,
      match.duration_ms ?? null,
      now,
      now,
      now,
    );
    // Warm only aliases derived from Spotify's own canonical metadata.  The
    // album-less form is created only while the pair is unambiguous.
    const canonical = { title: match.name!, artist, album: match.album?.name ?? '' };
    const addAlias = (title: string, artistName: string, album: string) => {
      const existing = db
        .prepare(
          'SELECT track_id as trackId FROM track_aliases WHERE normalized_title=? AND normalized_artist=? AND normalized_album=?',
        )
        .get(title, artistName, album) as { trackId: number } | undefined;
      const row = db.prepare('SELECT id FROM tracks WHERE spotify_track_id=?').get(match.id!) as {
        id: number;
      };
      if (existing && existing.trackId !== row.id) return;
      db.prepare(
        `INSERT INTO track_aliases (track_id,normalized_title,normalized_artist,normalized_album,hit_count,created_at,updated_at)
        VALUES (?,?,?,?,0,?,?) ON CONFLICT(normalized_title,normalized_artist,normalized_album) DO UPDATE SET updated_at=excluded.updated_at`,
      ).run(row.id, title, artistName, album, now, now);
    };
    addAlias(
      normalizeText(canonical.title),
      normalizeText(canonical.artist),
      normalizeText(canonical.album),
    );
    const pair = db
      .prepare(
        'SELECT COUNT(*) as count FROM tracks WHERE lower(title)=lower(?) AND lower(artist)=lower(?)',
      )
      .get(canonical.title, canonical.artist) as { count: number };
    if (pair.count === 1) {
      addAlias(normalizeText(canonical.title), normalizeText(canonical.artist), '');
    } else {
      // Once a second version is observed, every album-less mapping for the
      // pair becomes unsafe. Fail closed instead of retaining a stale choice.
      db.prepare(
        'DELETE FROM track_aliases WHERE normalized_title=? AND normalized_artist=? AND normalized_album=?',
      ).run(normalizeText(canonical.title), normalizeText(canonical.artist), '');
    }
  } catch {
    /* passive warming must never break a Spotify read */
  }
}

export function recordResolverAttempt(
  query: TrackQuery,
  strategy: string,
  status: 'matched' | 'ambiguous' | 'unmatched' | 'failed',
  trackId?: number,
  confidence?: number,
  errorId?: number,
  durationMs?: number,
  providerId = 'spotify',
  connectionId = 'spotify-default',
) {
  try {
    getDatabase()
      .prepare(
        'INSERT INTO resolver_attempts (query_title, query_artist, query_album, strategy, status, track_id, confidence, duration_ms, error_id, provider_id, connection_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        query.title,
        query.artist,
        query.album ?? null,
        strategy,
        status,
        trackId ?? null,
        confidence ?? null,
        durationMs ?? null,
        errorId ?? null,
        providerId,
        connectionId,
        Date.now(),
      );
  } catch {
    /* optional DB */
  }
}
