import type { ProviderCapabilityName } from './capabilities.js';
import { CapabilityUnavailableError } from './errors.js';
import type { ProviderConnection } from './types.js';
import { ProviderRegistry } from './registry.js';

export interface ReadRoutingOptions {
  connection_id?: string;
  provider?: string;
  preferred_connection_id?: string;
  read_fallback?: boolean;
}

export interface ReadProvenance {
  provider: string;
  connection_id: string;
  fallback: boolean;
}

export interface ReadResult<T> {
  data: T;
  provenance: ReadProvenance;
}

type Operation<T> = (connection: ProviderConnection) => Promise<T>;

export class ProviderReadServices {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly defaults: { preferredConnectionId?: string; allowFallback?: boolean } = {},
  ) {}

  private targets(capability: ProviderCapabilityName, options: ReadRoutingOptions) {
    const explicit = options.connection_id
      ? this.registry.getConnection(options.connection_id)
      : undefined;
    if (
      options.connection_id &&
      (!explicit ||
        explicit.summary.connected === false ||
        explicit.summary.capabilities[capability] !== true)
    )
      return [];
    const candidates = explicit
      ? [explicit]
      : this.registry.selectConnections({ provider: options.provider, capability });
    const preferredId = options.preferred_connection_id ?? this.defaults.preferredConnectionId;
    if (!preferredId) return candidates;
    const preferred = candidates.find((x) => x.summary.connectionId === preferredId);
    return preferred ? [preferred, ...candidates.filter((x) => x !== preferred)] : candidates;
  }

  private async run<T>(
    capability: ProviderCapabilityName,
    options: ReadRoutingOptions,
    operation: Operation<T>,
  ): Promise<ReadResult<T>> {
    const candidates = this.targets(capability, options);
    const allowFallback = options.read_fallback ?? this.defaults.allowFallback ?? true;
    if (!candidates.length)
      throw new CapabilityUnavailableError(capability, options.provider, options.connection_id);
    let lastError: unknown;
    for (const [index, connection] of candidates.entries()) {
      if (index > 0 && !allowFallback) break;
      try {
        return {
          data: await operation(connection),
          provenance: {
            provider: connection.summary.provider,
            connection_id: connection.summary.connectionId,
            fallback: index > 0,
          },
        };
      } catch (error) {
        lastError = error;
        if (index === candidates.length - 1 || !allowFallback) throw error;
      }
    }
    throw lastError ?? new CapabilityUnavailableError(capability, options.provider);
  }

  searchTracks(query: string, options: ReadRoutingOptions & Record<string, unknown> = {}) {
    return this.run('catalog', options, (c) => c.catalog!.searchTracks(query, options));
  }
  searchArtists(query: string, options: ReadRoutingOptions & Record<string, unknown> = {}) {
    return this.run('catalog', options, (c) => {
      if (!c.catalog?.searchArtists)
        throw new CapabilityUnavailableError('catalog', c.summary.provider, c.summary.connectionId);
      return c.catalog.searchArtists(query, options);
    });
  }
  searchAlbums(query: string, options: ReadRoutingOptions & Record<string, unknown> = {}) {
    return this.run('catalog', options, (c) => {
      if (!c.catalog?.searchAlbums)
        throw new CapabilityUnavailableError('catalog', c.summary.provider, c.summary.connectionId);
      return c.catalog.searchAlbums(query, options);
    });
  }
  getTrack(id: string, options: ReadRoutingOptions = {}) {
    return this.run('catalog', options, (c) => c.catalog!.getTrack(id));
  }
  getArtist(id: string, options: ReadRoutingOptions = {}) {
    return this.run('catalog', options, (c) => {
      if (!c.catalog?.getArtist)
        throw new CapabilityUnavailableError('catalog', c.summary.provider, c.summary.connectionId);
      return c.catalog.getArtist(id);
    });
  }
  listPlaylists(options: ReadRoutingOptions & Record<string, unknown> = {}) {
    return this.run('playlistRead', options, (c) => c.playlistRead!.listPlaylists(options));
  }
  getPlaylist(id: string, options: ReadRoutingOptions & Record<string, unknown> = {}) {
    return this.run('playlistRead', options, (c) => c.playlistRead!.getPlaylist(id, options));
  }
  getPlaylistTracks(id: string, options: ReadRoutingOptions & Record<string, unknown> = {}) {
    return this.run('playlistRead', options, (c) => c.playlistRead!.getPlaylistTracks(id, options));
  }
  getTopTracks(options: ReadRoutingOptions & Record<string, unknown> = {}) {
    return this.run('catalog', options, (c) => {
      if (!c.catalog?.getTopTracks)
        throw new CapabilityUnavailableError('catalog', c.summary.provider, c.summary.connectionId);
      return c.catalog.getTopTracks(options);
    });
  }
  getTopArtists(options: ReadRoutingOptions & Record<string, unknown> = {}) {
    return this.run('catalog', options, (c) => {
      if (!c.catalog?.getTopArtists)
        throw new CapabilityUnavailableError('catalog', c.summary.provider, c.summary.connectionId);
      return c.catalog.getTopArtists(options);
    });
  }
  getRecentlyPlayed(options: ReadRoutingOptions & Record<string, unknown> = {}) {
    return this.run('history', options, (c) => c.history!.getRecentlyPlayed(options));
  }
  getSavedTracks(options: ReadRoutingOptions & Record<string, unknown> = {}) {
    return this.run('library', options, (c) => c.library!.listSavedTracks(options));
  }
  checkSavedTracks(trackIds: string[], options: ReadRoutingOptions = {}) {
    return this.run('library', options, (c) => {
      if (!c.library?.checkSavedTracks)
        throw new CapabilityUnavailableError('library', c.summary.provider, c.summary.connectionId);
      return c.library.checkSavedTracks(trackIds);
    });
  }
  getCurrentlyPlaying(options: ReadRoutingOptions = {}) {
    return this.run('playback', options, (c) => {
      if (!c.playback?.getCurrentlyPlaying)
        throw new CapabilityUnavailableError(
          'playback',
          c.summary.provider,
          c.summary.connectionId,
        );
      return c.playback.getCurrentlyPlaying();
    });
  }
  getPlaybackState(options: ReadRoutingOptions = {}) {
    return this.run('playback', options, (c) => c.playback!.getPlaybackState());
  }
}
