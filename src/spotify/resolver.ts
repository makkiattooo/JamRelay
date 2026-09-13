import { SpotifyClient } from './client.js';
import { normalizeText, resolveCandidates, type TrackCandidate } from './normalize.js';
import {
  findCachedTrack,
  recordResolverAttempt,
  trackKey,
  upsertTrackAndAlias,
  type TrackQuery,
} from '../db/state.js';

export type Resolution = {
  status: 'matched' | 'ambiguous' | 'unmatched';
  source: 'database' | 'spotify_search';
  uri?: string;
  id?: string;
  match?: unknown;
  confidence?: number;
};

const compact = (x: TrackCandidate) => ({
  id: x.id,
  uri: x.uri,
  name: x.name,
  artists: x.artists,
  album: x.album,
  duration_ms: x.duration_ms,
});

export class TrackResolver {
  constructor(private client: SpotifyClient) {}
  async resolve(input: TrackQuery): Promise<Resolution> {
    const query = {
      ...input,
      title: normalizeText(input.title),
      artist: normalizeText(input.artist),
      album: input.album ? normalizeText(input.album) : '',
    };
    const cached = findCachedTrack(query);
    if (cached) {
      recordResolverAttempt(query, 'database', 'matched', cached.id, 1);
      return {
        status: 'matched',
        source: 'database',
        id: cached.spotifyTrackId,
        uri: cached.spotifyUri,
        confidence: 1,
      };
    }
    try {
      const response = await this.client.request<{ tracks?: { items?: TrackCandidate[] } }>(
        '/search?' +
          new URLSearchParams({ q: input.title + ' ' + input.artist, type: 'track', limit: '10' }),
      );
      const result = resolveCandidates(
        (response?.tracks?.items ?? []).map(compact),
        input.title,
        input.artist,
        input.album,
        input.year,
      );
      const status = result.status as 'matched' | 'ambiguous' | 'unmatched';
      const confidence = result.match?.score;
      if (status === 'matched' && result.match) {
        const m = result.match as TrackCandidate;
        let trackId: number | undefined;
        try {
          trackId = upsertTrackAndAlias(
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
            'spotify_search',
          );
        } catch {
          /* DB is unavailable in isolated client tests. */
        }
        recordResolverAttempt(query, 'spotify_search', 'matched', trackId, confidence);
        return {
          status: 'matched',
          source: 'spotify_search',
          id: m.id,
          uri: m.uri,
          match: result.match,
          confidence,
        };
      }
      recordResolverAttempt(query, 'spotify_search', status);
      return { status, source: 'spotify_search', match: result.match, confidence };
    } catch (error) {
      recordResolverAttempt(query, 'spotify_search', 'failed');
      throw error;
    }
  }
  async resolveMany(inputs: TrackQuery[]) {
    const pending = new Map<string, Promise<Resolution>>();
    return Promise.all(
      inputs.map((input) => {
        const key = trackKey({
          title: normalizeText(input.title),
          artist: normalizeText(input.artist),
          album: input.album ? normalizeText(input.album) : '',
        });
        const existing = pending.get(key);
        if (existing) return existing;
        const value = this.resolve(input);
        pending.set(key, value);
        return value;
      }),
    );
  }
}
