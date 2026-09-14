import { createHash } from 'node:crypto';
import {
  findTrackProviderMapping,
  getTrackProviderMappings,
  upsertTrackProviderMapping,
} from '../db/state.js';
import { getRateLimit } from '../db/state.js';
import { normalizeText, resolveCandidates, type MusicCandidate } from '../music/normalize.js';

export type TransferClassification =
  'exact' | 'high-confidence' | 'ambiguous' | 'unmatched' | 'unavailable' | 'unsupported';
export type TransferItem = {
  position: number;
  source: {
    id: string | null;
    uri?: string | null;
    title: string;
    artist: string;
    album?: string;
    isrc?: string;
    durationMs?: number;
  };
  classification: TransferClassification;
  confidence: number | null;
  reason: string;
  evidence: string[];
  destination?: {
    id: string;
    uri?: string;
    title: string;
    artist: string;
    metadata?: Record<string, unknown>;
  };
  candidates?: Array<{
    id: string;
    title: string;
    artist: string;
    confidence: number;
    metadata?: Record<string, unknown>;
  }>;
};
export type TransferPlan = {
  source_connection_id: string;
  source_provider: string;
  source_playlist_id: string;
  destination_connection_id: string;
  destination_provider: string;
  source_count: number;
  exact_count: number;
  high_confidence_count: number;
  ambiguous_count: number;
  unmatched_count: number;
  unavailable_count: number;
  unsupported_count: number;
  estimated_provider_calls: number;
  destination_capability_warnings: string[];
  items: TransferItem[];
  dry_run: true;
  writes_performed: 0;
  quota_estimate?: { provider: string; units: number; method: string; known: boolean };
  /** Digest of the immutable source/destination mapping decisions. */
  plan_fingerprint?: string;
};
export type TransferPlannerDependencies = {
  sourceTracks: any[];
  sourceProvider: string;
  sourceConnectionId: string;
  sourcePlaylistId: string;
  destinationProvider: string;
  destinationConnectionId: string;
  sourceOffset?: number;
  destinationPlaylistWriteSupported: boolean;
  destinationCatalogSupported: boolean;
  searchTracks: (query: string, options: Record<string, unknown>) => Promise<MusicCandidate[]>;
  rateLimit?: (provider: string, scope: string, connectionId: string) => boolean;
};
const rawTrack = (value: any) => value?.item ?? value?.track ?? value;
const sourceTrack = (value: any, position: number) => {
  const x = rawTrack(value),
    metadata = x?.metadata ?? {};
  return {
    position,
    id: x?.id == null ? null : String(x.id),
    uri: x?.uri ?? metadata.providerUri,
    title: String(x?.name ?? x?.title ?? ''),
    artist:
      (x?.artists ?? [])
        .map((a: any) => a.name)
        .filter(Boolean)
        .join(', ') || String(x?.artist ?? ''),
    album: x?.album?.name ?? metadata.albumName,
    isrc: x?.external_ids?.isrc ?? metadata.isrc,
    durationMs: x?.duration_ms ?? metadata.durationMs,
  };
};
const candidateView = (candidate: MusicCandidate & { score?: number }) => ({
  id: candidate.id,
  uri: candidate.metadata?.providerUri as string | undefined,
  title: candidate.name,
  artist: candidate.artists.map((x) => x.name).join(', '),
  metadata: candidate.metadata,
});
export async function planPlaylistTransfer(
  deps: TransferPlannerDependencies,
): Promise<TransferPlan> {
  const warnings: string[] = [];
  if (!deps.destinationPlaylistWriteSupported)
    warnings.push(
      'Destination connection does not support playlist writes. The plan remains readable and dry-run only.',
    );
  if (!deps.destinationCatalogSupported)
    warnings.push('Destination connection does not support catalog search/resolution.');
  const items: TransferItem[] = [];
  let calls = 0;
  for (let index = 0; index < deps.sourceTracks.length; index++) {
    const position = (deps.sourceOffset ?? 0) + index;
    const source = sourceTrack(deps.sourceTracks[index], position);
    const base = {
      position,
      source,
      confidence: null as number | null,
      reason: '',
      evidence: [] as string[],
    };
    if (!source.title || !source.artist) {
      items.push({
        ...base,
        classification: 'unmatched',
        reason: 'Source item lacks title or artist.',
      });
      continue;
    }
    const sourceMapping = source.id
      ? findTrackProviderMapping({
          providerId: deps.sourceProvider,
          connectionId: deps.sourceConnectionId,
          providerTrackId: source.id,
        })
      : null;
    const sourceRaw = rawTrack(deps.sourceTracks[index]);
    const canonicalId =
      sourceMapping?.trackId ??
      sourceRaw?.canonicalTrackId ??
      sourceRaw?.metadata?.canonicalTrackId;
    const canonicalDestination =
      canonicalId == null
        ? null
        : getTrackProviderMappings(canonicalId).find(
            (x) =>
              x.providerId === deps.destinationProvider &&
              x.connectionId === deps.destinationConnectionId,
          );
    if (canonicalDestination) {
      items.push({
        ...base,
        classification: 'exact',
        confidence: 1,
        reason: 'Verified destination provider mapping already exists.',
        evidence: ['verified provider mapping', 'canonical track match'],
        destination: {
          id: canonicalDestination.providerTrackId,
          uri: canonicalDestination.providerUri ?? undefined,
          title: source.title,
          artist: source.artist,
        },
      });
      continue;
    }
    if (!deps.destinationCatalogSupported) {
      items.push({
        ...base,
        classification: 'unsupported',
        reason: 'Destination catalog resolution is unsupported.',
        evidence: ['destination capability unavailable'],
      });
      continue;
    }
    if (
      deps.rateLimit?.(deps.destinationProvider, 'catalog', deps.destinationConnectionId) ??
      Boolean(getRateLimit(deps.destinationProvider, 'catalog', deps.destinationConnectionId))
    ) {
      items.push({
        ...base,
        classification: 'unavailable',
        reason: 'Destination catalog is rate limited; retry after the persisted wait state.',
        evidence: ['destination catalog rate limit'],
      });
      continue;
    }
    calls++;
    const candidates = await deps.searchTracks(source.title + ' ' + source.artist, {
      connection_id: deps.destinationConnectionId,
      provider: deps.destinationProvider,
    });
    const result = resolveCandidates(
      candidates,
      source.title,
      source.artist,
      source.album,
      undefined,
      { isrc: source.isrc, durationMs: source.durationMs },
    );
    const views = (result.candidates ?? [])
      .slice(0, 5)
      .map((candidate: any) => ({ ...candidateView(candidate), confidence: candidate.score ?? 0 }));
    const match: any = (result as any).match;
    const baseTitle = (value: string) =>
      normalizeText(value)
        .replace(/\b(?:live|remix|radio edit|acoustic|instrumental|remaster(?:ed)?)\b/g, '')
        .trim();
    const ambiguousVersions =
      (result.candidates ?? []).filter(
        (candidate: any) =>
          baseTitle(candidate.name) === baseTitle(source.title) &&
          normalizeText(candidate.artists?.[0]?.name ?? '') === normalizeText(source.artist),
      ).length > 1;
    if (ambiguousVersions) {
      items.push({
        ...base,
        classification: 'ambiguous',
        confidence: match?.score ?? null,
        reason: 'Multiple destination versions share the same normalized title and artist.',
        evidence: ['version markers', 'ambiguity safety threshold'],
        candidates: views,
      });
      continue;
    }
    if (result.status === 'ambiguous') {
      items.push({
        ...base,
        classification: 'ambiguous',
        confidence: match?.score ?? null,
        reason: 'Multiple destination candidates are too close to choose automatically.',
        evidence: ['normalized title/artist candidates', 'ambiguity safety threshold'],
        candidates: views,
      });
      continue;
    }
    if (result.status !== 'matched' || !match) {
      items.push({
        ...base,
        classification: 'unmatched',
        reason: 'No destination candidate met the confidence threshold.',
        evidence: ['normalized title/artist search'],
        candidates: views,
      });
      continue;
    }
    const exactIsrc = source.isrc && match.metadata?.isrc === source.isrc;
    const confidence = Number(match.score ?? 0);
    const classification: TransferClassification = exactIsrc
      ? 'exact'
      : confidence >= 0.85
        ? 'high-confidence'
        : 'unmatched';
    const evidence = exactIsrc
      ? ['ISRC exact match']
      : [
          'normalized title/artist match',
          ...(source.album ? ['album context'] : []),
          ...(source.durationMs != null ? ['duration tolerance'] : []),
        ];
    if (classification === 'unmatched') {
      items.push({
        ...base,
        classification,
        confidence,
        reason: 'Candidate was below the defensible transfer confidence threshold.',
        evidence,
        candidates: views,
      });
      continue;
    }
    const destination = candidateView(match);
    if (canonicalId != null)
      upsertTrackProviderMapping({
        trackId: canonicalId,
        providerId: deps.destinationProvider,
        connectionId: deps.destinationConnectionId,
        providerTrackId: destination.id,
        providerUri: destination.uri,
        isrc: match.metadata?.isrc as string | undefined,
        evidence: { planner: classification, confidence },
      });
    items.push({
      ...base,
      classification,
      confidence,
      reason: exactIsrc
        ? 'ISRC identifies the same recording.'
        : 'High-confidence metadata match; no automatic write is performed.',
      evidence,
      destination,
    });
  }
  const count = (classification: TransferClassification) =>
    items.filter((x) => x.classification === classification).length;
  const planFingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        source_connection_id: deps.sourceConnectionId,
        source_provider: deps.sourceProvider,
        source_playlist_id: deps.sourcePlaylistId,
        destination_connection_id: deps.destinationConnectionId,
        destination_provider: deps.destinationProvider,
        items,
      }),
    )
    .digest('hex');
  return {
    source_connection_id: deps.sourceConnectionId,
    source_provider: deps.sourceProvider,
    source_playlist_id: deps.sourcePlaylistId,
    destination_connection_id: deps.destinationConnectionId,
    destination_provider: deps.destinationProvider,
    source_count: items.length,
    exact_count: count('exact'),
    high_confidence_count: count('high-confidence'),
    ambiguous_count: count('ambiguous'),
    unmatched_count: count('unmatched'),
    unavailable_count: count('unavailable'),
    unsupported_count: count('unsupported'),
    estimated_provider_calls: calls,
    destination_capability_warnings: warnings,
    items,
    dry_run: true,
    writes_performed: 0,
    plan_fingerprint: planFingerprint,
    quota_estimate:
      deps.destinationProvider === 'youtube'
        ? { provider: 'youtube', units: calls, method: 'search.list', known: true }
        : {
            provider: deps.destinationProvider,
            units: calls,
            method: 'provider_catalog_search',
            known: false,
          },
  };
}
