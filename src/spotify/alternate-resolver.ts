import { parseSpotifyIdentifier } from './identifiers.js';
import type { TrackQuery } from '../db/state.js';

export type AlternateTrackCandidate = {
  spotifyId?: string;
  spotifyUrl?: string;
  title?: string;
  artist?: string;
  album?: string;
  confidence?: number;
};

export interface AlternateTrackProvider {
  readonly name: string;
  resolve(input: TrackQuery): Promise<AlternateTrackCandidate[]>;
}

/** Adapter for an explicitly configured resolver API. It must return
 * `{candidates:[{spotifyId|spotifyUrl:...}]}`; its metadata is advisory only. */
export class ConfiguredAlternateTrackProvider implements AlternateTrackProvider {
  readonly name = process.env.ALTERNATE_TRACK_RESOLVER_NAME?.trim() || 'web_search';
  private readonly endpoint = process.env.ALTERNATE_TRACK_RESOLVER_URL?.trim();
  async resolve(input: TrackQuery): Promise<AlternateTrackCandidate[]> {
    if (!this.endpoint) return [];
    const url = new URL(this.endpoint);
    url.searchParams.set('title', input.title);
    url.searchParams.set('artist', input.artist);
    if (input.album) url.searchParams.set('album', input.album);
    if (input.year) url.searchParams.set('year', String(input.year));
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Number(process.env.ALTERNATE_TRACK_RESOLVER_TIMEOUT_MS || 2500),
    );
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      const token = process.env.ALTERNATE_TRACK_RESOLVER_TOKEN?.trim();
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) return [];
      const body = (await response.json()) as { candidates?: unknown };
      if (!Array.isArray(body.candidates)) return [];
      return body.candidates.slice(
        0,
        Number(process.env.ALTERNATE_TRACK_RESOLVER_MAX_RESULTS || 5),
      ) as AlternateTrackCandidate[];
    } finally {
      clearTimeout(timer);
    }
  }
}

export function candidateSpotifyId(candidate: AlternateTrackCandidate): string | undefined {
  const value = candidate.spotifyId ?? candidate.spotifyUrl;
  if (!value) return undefined;
  try {
    return parseSpotifyIdentifier(value, 'track').id;
  } catch {
    return undefined;
  }
}
