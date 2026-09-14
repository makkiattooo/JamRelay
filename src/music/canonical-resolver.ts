import { normalizeText, resolveCandidates, type MusicCandidate } from './normalize.js';

export type CanonicalResolutionStatus = 'matched' | 'ambiguous' | 'unmatched' | 'waiting';
export type CanonicalResolutionSource =
  'database' | 'provider_catalog' | 'external_verified' | 'manual';
export type CanonicalTrackQuery = {
  title: string;
  artist: string;
  album?: string;
  year?: number;
  isrc?: string;
  durationMs?: number;
};
export type CanonicalResolution = {
  status: CanonicalResolutionStatus;
  source: CanonicalResolutionSource;
  provider?: string;
  connectionId?: string;
  canonicalId?: string | number;
  providerTrackId?: string;
  providerUri?: string;
  providerUrl?: string;
  match?: MusicCandidate;
  candidates?: MusicCandidate[];
  confidence?: number;
  waitingReason?: string;
};
export interface CanonicalResolverDependencies {
  provider: string;
  connectionId: string;
  searchTracks(query: string): Promise<MusicCandidate[]>;
  getTrack?(providerTrackId: string): Promise<MusicCandidate | null>;
  findCached?(
    query: CanonicalTrackQuery,
  ): Promise<CanonicalResolution | null> | CanonicalResolution | null;
  persist?(
    query: CanonicalTrackQuery,
    match: MusicCandidate,
    source: CanonicalResolutionSource,
    confidence: number,
  ): Promise<{ canonicalId?: string | number } | void> | { canonicalId?: string | number } | void;
  isRateLimited?(): boolean;
}

const normalized = (query: CanonicalTrackQuery): CanonicalTrackQuery => ({
  ...query,
  title: normalizeText(query.title),
  artist: normalizeText(query.artist),
  album: query.album ? normalizeText(query.album) : '',
});

export class CanonicalTrackResolver {
  constructor(private readonly dependencies: CanonicalResolverDependencies) {}
  async resolve(input: CanonicalTrackQuery): Promise<CanonicalResolution> {
    const query = normalized(input);
    const cached = await this.dependencies.findCached?.(query);
    if (cached)
      return {
        ...cached,
        source: 'database',
        provider: cached.provider ?? this.dependencies.provider,
        connectionId: cached.connectionId ?? this.dependencies.connectionId,
      };
    if (this.dependencies.isRateLimited?.())
      return {
        status: 'waiting',
        source: 'provider_catalog',
        provider: this.dependencies.provider,
        connectionId: this.dependencies.connectionId,
        waitingReason: 'rate_limited',
      };
    return this.match(
      input,
      query,
      await this.dependencies.searchTracks(input.title + ' ' + input.artist),
      'provider_catalog',
    );
  }
  async resolveExternal(
    input: CanonicalTrackQuery,
    providerTrackIds: string[],
  ): Promise<CanonicalResolution> {
    if (!this.dependencies.getTrack)
      return {
        status: 'unmatched',
        source: 'external_verified',
        provider: this.dependencies.provider,
        connectionId: this.dependencies.connectionId,
      };
    const candidates: MusicCandidate[] = [];
    for (const id of [...new Set(providerTrackIds)]) {
      const candidate = await this.dependencies.getTrack(id);
      if (candidate) candidates.push(candidate);
    }
    return this.match(input, normalized(input), candidates, 'external_verified');
  }
  private async match(
    input: CanonicalTrackQuery,
    query: CanonicalTrackQuery,
    candidates: MusicCandidate[],
    source: CanonicalResolutionSource,
  ): Promise<CanonicalResolution> {
    const result = resolveCandidates(
      candidates,
      input.title,
      input.artist,
      input.album,
      input.year,
      { isrc: input.isrc, durationMs: input.durationMs },
    );
    const base: CanonicalResolution = {
      status: result.status as CanonicalResolutionStatus,
      source,
      provider: this.dependencies.provider,
      connectionId: this.dependencies.connectionId,
      candidates: result.candidates as MusicCandidate[],
      confidence: result.match?.score,
    };
    if (result.status !== 'matched' || !result.match) return base;
    const match = result.match as MusicCandidate & { score?: number },
      confidence = match.score ?? 0,
      persisted = await this.dependencies.persist?.(query, match, source, confidence);
    return {
      ...base,
      status: 'matched',
      match,
      confidence,
      canonicalId: persisted && 'canonicalId' in persisted ? persisted.canonicalId : undefined,
      providerTrackId: match.id,
      providerUri: match.metadata?.providerUri as string | undefined,
      providerUrl: match.metadata?.providerUrl as string | undefined,
    };
  }
}
