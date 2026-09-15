import { toolContext } from '../mcp/context.js';
import type { PlaylistGateway, PlaylistWriteTarget } from '../providers/playlist-gateway.js';
import { mapLimit } from '../utils/concurrency.js';

export type PlaylistState = {
  provider: string;
  connectionId: string;
  providerPlaylistId: string;
  playlist: unknown;
  metadata: unknown;
  providerRevision: string | null;
  items: unknown[];
  totalCount: number;
  pagesFetched: number;
  cache: 'hit' | 'miss';
  cacheProvenance: 'cache_hit' | 'provider_fetch';
  provenance: { provider: string; connectionId: string; cache: 'hit' | 'miss' };
  metrics: { providerCalls: number; pagesFetched: number; cacheHit: boolean };
};

type CacheEntry = { revision: string | null; fetchedAt: number; state: PlaylistState };
const playlistCache = new Map<string, CacheEntry>();
const UNKNOWN_REVISION_TTL_MS = 30_000;
const DEFAULT_READ_CONCURRENCY = 8;
const cloneState = (state: PlaylistState): PlaylistState => {
  try {
    return structuredClone(state);
  } catch {
    return {
      ...state,
      items: [...state.items],
    };
  }
};

const pageItems = (value: any): unknown[] =>
  Array.isArray(value) ? value : (value?.data?.items ?? value?.items ?? []);

const nextValue = (value: any): string | null => (value?.next == null ? null : String(value.next));

const nextOptions = (next: string, current: Record<string, unknown>) => {
  try {
    const url = new URL(next);
    const offset = url.searchParams.get('offset');
    const pageToken = url.searchParams.get('pageToken') ?? url.searchParams.get('page_token');
    return {
      ...current,
      ...(offset !== null ? { offset: Number(offset) } : {}),
      ...(pageToken !== null ? { pageToken } : {}),
    };
  } catch {
    return { ...current, pageToken: next };
  }
};
const revisionOf = (playlist: any): string | null => {
  const value =
    playlist?.providerRevision ?? playlist?.metadata?.providerRevision ?? playlist?.snapshot_id;
  return value == null ? null : String(value);
};

/** Provider-neutral complete playlist reader. Cursor providers are traversed sequentially. */
export class PlaylistStateReader {
  constructor(private readonly gateway: PlaylistGateway) {}

  async read(playlistId: string, target: PlaylistWriteTarget = {}): Promise<PlaylistState> {
    const resolved =
      typeof (this.gateway as any).resolveReadTarget === 'function'
        ? this.gateway.resolveReadTarget(target as Record<string, unknown>)
        : undefined;
    const provider = resolved?.summary.provider ?? target.provider ?? 'unknown';
    const connectionId = resolved?.summary.connectionId ?? target.connection_id ?? 'unknown';
    const singleflight = toolContext.get()?.singleflight;
    const key = `playlist-state:${provider}:${connectionId}:${playlistId}`;
    return singleflight
      ? singleflight.do(key, () => this.readUnshared(playlistId, target))
      : this.readUnshared(playlistId, target);
  }

  private async readUnshared(
    playlistId: string,
    target: PlaylistWriteTarget,
  ): Promise<PlaylistState> {
    const connection =
      typeof (this.gateway as any).resolveReadTarget === 'function'
        ? this.gateway.resolveReadTarget(target as Record<string, unknown>)
        : {
            summary: {
              provider: target.provider ?? 'unknown',
              connectionId: target.connection_id ?? 'unknown',
            },
          };
    const resolvedTarget = {
      ...target,
      provider: connection.summary.provider,
      connection_id: connection.summary.connectionId,
    };
    const playlist = await this.gateway.get(playlistId, resolvedTarget);
    const cacheKey = `playlist-state:${resolvedTarget.provider}:${resolvedTarget.connection_id}:${playlistId}`;
    const revision = revisionOf(playlist);
    const cached = playlistCache.get(cacheKey);
    let usedParallelPages = false;
    if (
      cached &&
      Array.isArray(cached.state.items) &&
      typeof cached.state.totalCount === 'number' &&
      ((revision !== null && cached.revision === String(revision)) ||
        (revision === null && Date.now() - cached.fetchedAt < UNKNOWN_REVISION_TTL_MS))
    )
      return {
        ...cloneState(cached.state),
        playlist,
        cache: 'hit',
        cacheProvenance: 'cache_hit',
        metrics: { ...cached.state.metrics, providerCalls: 1, cacheHit: true },
      };
    const items: unknown[] = [];
    let options: Record<string, unknown> = {
      connection_id: resolvedTarget.connection_id,
      provider: resolvedTarget.provider,
      preferred_connection_id: target.preferred_connection_id,
      limit: 50,
      offset: 0,
    };
    let pagesFetched = 0;
    const seen = new Set<string>();
    const readPage = async (pageOptions: Record<string, unknown>) => {
      if (toolContext.get()?.signal.aborted) throw new Error('operation_cancelled');
      return this.gateway.items(playlistId, pageOptions);
    };
    const firstPage = await readPage(options);
    const firstValues = pageItems(firstPage);
    items.push(...firstValues);
    pagesFetched++;
    const firstNext = nextValue(firstPage);
    const total =
      (playlist as any)?.trackCount ?? (playlist as any)?.items?.total ?? (firstPage as any)?.total;
    const firstOffset = firstNext ? nextOptions(firstNext, options).offset : undefined;
    if (
      firstNext &&
      typeof firstOffset === 'number' &&
      typeof total === 'number' &&
      firstOffset > 0 &&
      firstOffset < total
    ) {
      usedParallelPages = true;
      const offsets = Array.from(
        { length: Math.ceil((total - firstOffset) / Number(options.limit)) },
        (_, index) => firstOffset + index * Number(options.limit),
      );
      const pages = await mapLimit(
        offsets,
        {
          concurrency: Math.min(
            32,
            Math.max(1, Number(process.env.PLAYLIST_READ_CONCURRENCY ?? DEFAULT_READ_CONCURRENCY)),
          ),
          signal: toolContext.get()?.signal,
        },
        (offset) => readPage({ ...options, offset }),
      );
      for (const page of pages) {
        items.push(...pageItems(page));
        pagesFetched++;
      }
    } else {
      let page = firstPage;
      let currentOptions = options;
      for (;;) {
        const values = page === firstPage ? firstValues : pageItems(page);
        if (page !== firstPage) {
          items.push(...values);
          pagesFetched++;
        }
        const next = nextValue(page);
        if (!next || seen.has(next) || values.length === 0) break;
        seen.add(next);
        currentOptions = nextOptions(next, currentOptions);
        page = await readPage(currentOptions);
      }
    }
    if (usedParallelPages && revision !== null) {
      const after = await this.gateway.get(playlistId, resolvedTarget);
      const afterRevision = revisionOf(after);
      if (afterRevision !== null && afterRevision !== revision)
        throw new Error('playlist_state_stale');
    }
    const state: PlaylistState = {
      playlist,
      items,
      totalCount: typeof total === 'number' ? total : items.length,
      pagesFetched,
      cache: 'miss',
      provider: connection.summary.provider,
      connectionId: connection.summary.connectionId,
      providerPlaylistId: playlistId,
      metadata: playlist,
      providerRevision: revision === null ? null : String(revision),
      cacheProvenance: 'provider_fetch',
      provenance: {
        provider: connection.summary.provider,
        connectionId: connection.summary.connectionId,
        cache: 'miss',
      },
      metrics: { providerCalls: pagesFetched + 1, pagesFetched, cacheHit: false },
    };
    playlistCache.set(cacheKey, {
      revision: revision === null ? null : String(revision),
      fetchedAt: Date.now(),
      state: cloneState(state),
    });
    return state;
  }
}

export function invalidatePlaylistStateCache(playlistId: string, target: PlaylistWriteTarget = {}) {
  playlistCache.delete(
    `playlist-state:${target.provider ?? ''}:${target.connection_id ?? ''}:${playlistId}`,
  );
}
