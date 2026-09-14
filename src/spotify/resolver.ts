import { SpotifyClient } from './client.js';
import { normalizeText, resolveCandidates } from '../music/normalize.js';
import type { TrackCandidate } from './normalize.js';
import { parseSpotifyIdentifier } from './identifiers.js';
import {
  candidateSpotifyId,
  ConfiguredAlternateTrackProvider,
  type AlternateTrackProvider,
  type AlternateTrackCandidate,
} from './alternate-resolver.js';
import {
  findCachedTrack,
  getRateLimit,
  recordResolverAttempt,
  trackKey,
  upsertTrackAndAlias,
  type TrackQuery,
} from '../db/state.js';
import { isDatabaseInitialized } from '../db/database.js';

export type Resolution = {
  status: 'matched' | 'ambiguous' | 'unmatched' | 'waiting';
  source: 'database' | 'spotify_search' | 'external_verified' | 'alternate_external' | 'manual';
  uri?: string;
  id?: string;
  match?: unknown;
  confidence?: number;
  errorId?: number;
  provider?: string;
  connectionId?: string;
};
const compact = (x: any): TrackCandidate => ({
  id: x.id,
  uri: x.uri ?? `spotify:track:${x.id}`,
  name: x.name,
  artists: x.artists ?? [],
  album: x.album,
  duration_ms: x.duration_ms,
});

export class TrackResolver {
  private lastBatchMetrics = {
    total: 0,
    cacheHits: 0,
    cacheMisses: 0,
    searches: 0,
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
    durationMs: 0,
  };
  constructor(
    private client: SpotifyClient,
    private alternate: AlternateTrackProvider = new ConfiguredAlternateTrackProvider(),
  ) {}
  private normalized(input: TrackQuery): TrackQuery {
    return {
      ...input,
      title: normalizeText(input.title),
      artist: normalizeText(input.artist),
      album: input.album ? normalizeText(input.album) : '',
    };
  }
  private persist(
    query: TrackQuery,
    m: TrackCandidate,
    source: 'spotify_search' | 'external_verified' | 'manual',
    confidence?: number,
  ) {
    try {
      return upsertTrackAndAlias(
        query,
        {
          id: m.id,
          uri: m.uri,
          name: m.name,
          artist: m.artists.map((a) => a.name).join(', '),
          album: m.album?.name,
          durationMs: Number(m.duration_ms ?? 0) || null,
          confidence,
        },
        source,
      );
    } catch (error) {
      if (isDatabaseInitialized()) throw error;
      return undefined;
    }
  }
  async resolve(input: TrackQuery): Promise<Resolution> {
    const started = Date.now(),
      query = this.normalized(input),
      cached = findCachedTrack(query);
    if (cached) {
      recordResolverAttempt(
        query,
        'database',
        'matched',
        cached.id,
        1,
        undefined,
        Date.now() - started,
      );
      return {
        status: 'matched',
        source: 'database',
        id: cached.spotifyTrackId,
        uri: cached.spotifyUri,
        confidence: 1,
        provider: 'spotify',
        connectionId: 'spotify-default',
      };
    }
    return getRateLimit('spotify', 'search')
      ? this.external(query, input, started)
      : this.search(query, input, started);
  }
  private async search(query: TrackQuery, input: TrackQuery, started: number): Promise<Resolution> {
    try {
      const response = await this.client.request<any>(
        '/search?' +
          new URLSearchParams({ q: input.title + ' ' + input.artist, type: 'track', limit: '10' }),
      );
      const result = resolveCandidates<TrackCandidate>(
        (response?.tracks?.items ?? []).map(compact),
        input.title,
        input.artist,
        input.album,
        input.year,
      );
      const status = result.status as 'matched' | 'ambiguous' | 'unmatched',
        confidence = result.match?.score;
      const trackId =
        status === 'matched' && result.match
          ? this.persist(query, result.match as TrackCandidate, 'spotify_search', confidence)
          : undefined;
      recordResolverAttempt(
        query,
        'spotify_search',
        status,
        trackId,
        confidence,
        undefined,
        Date.now() - started,
      );
      return {
        status,
        source: 'spotify_search',
        match: result.match,
        confidence,
        ...(status === 'matched' && result.match
          ? { id: result.match.id, uri: result.match.uri }
          : {}),
        provider: 'spotify',
        connectionId: 'spotify-default',
      };
    } catch (error) {
      recordResolverAttempt(
        query,
        'spotify_search',
        'failed',
        undefined,
        undefined,
        (error as any).apiErrorId,
        Date.now() - started,
      );
      throw error;
    }
  }
  private async external(
    query: TrackQuery,
    input: TrackQuery,
    started: number,
  ): Promise<Resolution> {
    let candidates: AlternateTrackCandidate[] = [];
    try {
      candidates = await this.alternate.resolve(query);
    } catch {
      /* bounded provider failure */
    }
    const ids = [...new Set(candidates.map(candidateSpotifyId).filter(Boolean) as string[])],
      verified: TrackCandidate[] = [];
    for (const id of ids) {
      try {
        const raw = await this.client.request<any>('/tracks/' + encodeURIComponent(id));
        if (!raw) continue;
        const canonical = compact(raw),
          check = resolveCandidates<TrackCandidate>(
            [canonical],
            input.title,
            input.artist,
            input.album,
            input.year,
          );
        if (check.status === 'matched' && check.match)
          verified.push({ ...canonical, score: check.match.score } as any);
      } catch (error) {
        if ((error as any).status === 429 && (error as any).scope !== 'search') throw error;
      }
    }
    const result = resolveCandidates<TrackCandidate>(
        verified,
        input.title,
        input.artist,
        input.album,
        input.year,
      ),
      confidence = result.match?.score;
    if (result.status === 'matched' && result.match) {
      const trackId = this.persist(
        query,
        result.match as TrackCandidate,
        'external_verified',
        confidence,
      );
      recordResolverAttempt(
        query,
        'web_search',
        'matched',
        trackId,
        confidence,
        undefined,
        Date.now() - started,
      );
      return {
        status: 'matched',
        source: 'external_verified',
        id: result.match.id,
        uri: result.match.uri,
        confidence,
        provider: 'spotify',
        connectionId: 'spotify-default',
      };
    }
    const status = result.status === 'ambiguous' ? 'ambiguous' : 'waiting';
    recordResolverAttempt(
      query,
      'web_search',
      status === 'waiting' ? 'unmatched' : status,
      undefined,
      confidence,
      undefined,
      Date.now() - started,
    );
    return { status, source: 'alternate_external', confidence, match: result.match };
  }
  async rememberTrack(input: {
    track_id: string;
    title: string;
    artist: string;
    album?: string;
    provider?: string;
    connection_id?: string;
  }): Promise<Resolution> {
    if (input.provider && input.provider !== 'spotify')
      throw new Error('remember_track_provider_requires_provider_adapter');
    const started = Date.now(),
      query = this.normalized(input),
      parsed = parseSpotifyIdentifier(input.track_id, 'track'),
      raw = await this.client.request<any>('/tracks/' + encodeURIComponent(parsed.id)),
      canonical = compact(raw),
      result = resolveCandidates<TrackCandidate>(
        [canonical],
        input.title,
        input.artist,
        input.album,
      );
    if (result.status !== 'matched' || !result.match) {
      recordResolverAttempt(
        query,
        'manual',
        'unmatched',
        undefined,
        result.match?.score,
        undefined,
        Date.now() - started,
      );
      throw new Error('manual_track_metadata_mismatch');
    }
    const trackId = this.persist(query, canonical, 'manual', result.match.score);
    recordResolverAttempt(
      query,
      'manual',
      'matched',
      trackId,
      result.match.score,
      undefined,
      Date.now() - started,
    );
    return {
      status: 'matched',
      source: 'manual',
      id: canonical.id,
      uri: canonical.uri,
      confidence: result.match.score,
      provider: input.provider ?? 'spotify',
      connectionId: input.connection_id ?? 'spotify-default',
    };
  }
  getLastBatchMetrics() {
    return { ...this.lastBatchMetrics };
  }
  async resolveMany(inputs: TrackQuery[], options: { concurrency?: number } = {}) {
    const started = Date.now();
    const concurrency = Math.max(
      1,
      Math.min(32, (options.concurrency ?? Number(process.env.SPOTIFY_READ_CONCURRENCY)) || 12),
    );
    const pending = new Map<string, Promise<Resolution>>();
    const results = new Array<Resolution>(inputs.length);
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const index = cursor++;
        if (index >= inputs.length) return;
        const input = inputs[index];
        const key = trackKey(this.normalized(input));
        let value = pending.get(key);
        if (!value) {
          value = this.resolve(input);
          pending.set(key, value);
        }
        results[index] = await value;
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
    const cacheHits = results.filter((x) => x.source === 'database').length;
    this.lastBatchMetrics = {
      total: inputs.length,
      cacheHits,
      cacheMisses: inputs.length - cacheHits,
      searches: results.filter((x) => x.source === 'spotify_search').length,
      matched: results.filter((x) => x.status === 'matched').length,
      ambiguous: results.filter((x) => x.status === 'ambiguous').length,
      unmatched: results.filter((x) => x.status === 'unmatched').length,
      durationMs: Date.now() - started,
    };
    return results;
  }
}
