import type { MusicCandidate } from '../music/normalize.js';
import type {
  CatalogCapability,
  HistoryCapability,
  IdentityCapability,
  LibraryCapability,
  PlaybackCapability,
  PlaylistReadCapability,
  PlaylistWriteCapability,
} from '../providers/capabilities.js';
import { ProviderApiError } from '../providers/errors.js';
import type { ProviderConnection } from '../providers/types.js';
import { chunks } from '../utils/chunks.js';
import { SpotifyAuth } from './auth.js';
import { SpotifyClient } from './client.js';
import type { ProviderHttpClient } from '../providers/http-client.js';
import { SpotifyApiError } from './errors.js';
import { parseSpotifyIdentifier } from './identifiers.js';

type SpotifyAdapterOptions = { connectionId?: string; displayName?: string };

const track = (value: any): MusicCandidate | null =>
  value?.id && value?.name
    ? {
        id: String(value.id),
        name: String(value.name),
        artists: (value.artists ?? []).map((artist: any) => ({
          id: artist.id,
          name: String(artist.name ?? ''),
        })),
        album: value.album
          ? {
              id: value.album.id,
              name: String(value.album.name ?? ''),
              release_date: value.album.release_date,
            }
          : undefined,
        metadata: {
          providerUri: value.uri,
          providerUrl: value.external_urls?.spotify,
          durationMs: value.duration_ms,
          explicit: value.explicit,
          isrc: value.external_ids?.isrc,
        },
      }
    : null;

const artist = (value: any) =>
  value?.id && value?.name
    ? {
        id: String(value.id),
        name: String(value.name),
        metadata: {
          providerUri: value.uri,
          providerUrl: value.external_urls?.spotify,
          genres: value.genres,
          popularity: value.popularity,
          followers: value.followers?.total,
        },
      }
    : null;

const album = (value: any) =>
  value?.id && value?.name
    ? {
        id: String(value.id),
        name: String(value.name),
        artists: (value.artists ?? []).map((x: any) => ({ id: x.id, name: x.name })),
        metadata: {
          providerUri: value.uri,
          providerUrl: value.external_urls?.spotify,
          releaseDate: value.release_date,
          totalTracks: value.total_tracks,
        },
      }
    : null;

const episode = (value: any) =>
  value?.id && value?.name
    ? {
        id: String(value.id),
        name: String(value.name),
        metadata: {
          mediaType: 'episode',
          providerUri: value.uri,
          providerUrl: value.external_urls?.spotify,
          description: value.description,
          durationMs: value.duration_ms,
          releaseDate: value.release_date,
          explicit: value.explicit,
          show: value.show
            ? { id: value.show.id, name: value.show.name, uri: value.show.uri }
            : undefined,
        },
      }
    : null;

const playlist = (value: any) => ({
  id: value?.id,
  name: value?.name,
  description: value?.description,
  public: value?.public,
  collaborative: value?.collaborative,
  trackCount: value?.items?.total,
  metadata: {
    providerUri: value?.uri,
    providerUrl: value?.external_urls?.spotify,
    providerSnapshotId: value?.snapshot_id,
    owner: value?.owner?.display_name,
  },
});

const page = (value: any, map: (item: any) => unknown) => ({
  items: (value?.items ?? []).map(map),
  total: value?.total,
  limit: value?.limit,
  offset: value?.offset,
  next: value?.next,
});

const identity = (value: any) => ({
  id: value?.id,
  displayName: value?.display_name,
  country: value?.country,
  product: value?.product,
  metadata: { providerCountry: value?.country, providerProduct: value?.product },
});

const playback = (value: any) => ({
  isPlaying: Boolean(value?.is_playing),
  progressMs: value?.progress_ms,
  device: value?.device
    ? {
        id: value.device.id,
        name: value.device.name,
        type: value.device.type,
        volumePercent: value.device.volume_percent,
      }
    : null,
  item: track(value?.item),
  repeatState: value?.repeat_state,
  shuffleState: value?.shuffle_state,
  context: value?.context ? { type: value.context.type, uri: value.context.uri } : undefined,
});

export class SpotifyProviderAdapter implements ProviderConnection {
  readonly summary;
  readonly identity: IdentityCapability;
  readonly catalog: CatalogCapability;
  readonly playlistRead: PlaylistReadCapability;
  readonly playlistWrite: PlaylistWriteCapability;
  readonly library: LibraryCapability;
  readonly playback: PlaybackCapability;
  readonly history: HistoryCapability;

  constructor(
    private readonly auth: SpotifyAuth,
    private readonly client: ProviderHttpClient = new SpotifyClient(auth),
    options: SpotifyAdapterOptions = {},
  ) {
    const connectionId = options.connectionId ?? 'spotify-default';
    this.summary = {
      connectionId,
      provider: 'spotify',
      displayName: options.displayName ?? 'Spotify',
      capabilities: {
        identity: true,
        catalog: true,
        playlistRead: true,
        playlistWrite: true,
        library: true,
        playback: true,
        history: true,
        playlistOperations: {
          create: true,
          add: true,
          remove: true,
          reorder: true,
          replace: true,
          update: true,
        },
      },
      metadata: { provider: 'spotify' },
    };
    this.identity = {
      getCurrentUser: async () =>
        identity(await this.call('identity', () => this.client.request('/me'))),
    };
    this.catalog = {
      searchTracks: async (query, options = {}) => {
        const params = new URLSearchParams({
          q: query,
          type: 'track',
          limit: String(Math.min(50, Number(options.limit ?? 20))),
          offset: String(Number(options.offset ?? 0)),
        });
        const result: any = await this.call('catalog', () =>
          this.client.request('/search?' + params),
        );
        return (result?.tracks?.items ?? []).map(track).filter(Boolean) as MusicCandidate[];
      },
      searchArtists: async (query, options = {}) => {
        const params = new URLSearchParams({
          q: query,
          type: 'artist',
          limit: String(Math.min(50, Number(options.limit ?? 20))),
          offset: String(Number(options.offset ?? 0)),
        });
        const result: any = await this.call('catalog', () =>
          this.client.request('/search?' + params),
        );
        return (result?.artists?.items ?? []).map(artist).filter(Boolean);
      },
      searchAlbums: async (query, options = {}) => {
        const params = new URLSearchParams({
          q: query,
          type: 'album',
          limit: String(Math.min(50, Number(options.limit ?? 20))),
          offset: String(Number(options.offset ?? 0)),
        });
        const result: any = await this.call('catalog', () =>
          this.client.request('/search?' + params),
        );
        return (result?.albums?.items ?? []).map(album).filter(Boolean);
      },
      getTrack: async (id) =>
        track(
          await this.call('catalog', () =>
            this.client.request('/tracks/' + parseSpotifyIdentifier(id, 'track').id),
          ),
        ),
      getArtist: async (id) =>
        artist(
          await this.call('catalog', () =>
            this.client.request('/artists/' + parseSpotifyIdentifier(id, 'artist').id),
          ),
        ),
      getTopTracks: async (options = {}) => {
        const result = await this.call('catalog', () =>
          this.client.request(
            '/me/top/tracks?' +
              new URLSearchParams({
                time_range: String(options.time_range ?? 'medium_term'),
                limit: String(Math.min(50, Number(options.limit ?? 20))),
                offset: String(Number(options.offset ?? 0)),
              }),
          ),
        );
        return page(result, track);
      },
      getTopArtists: async (options = {}) => {
        const result = await this.call('catalog', () =>
          this.client.request(
            '/me/top/artists?' +
              new URLSearchParams({
                time_range: String(options.time_range ?? 'medium_term'),
                limit: String(Math.min(50, Number(options.limit ?? 20))),
                offset: String(Number(options.offset ?? 0)),
              }),
          ),
        );
        return page(result, artist);
      },
    };
    this.playlistRead = {
      listPlaylists: async (options = {}) =>
        page(
          await this.call('playlistRead', () =>
            this.client.request(
              '/me/playlists?limit=' +
                Math.min(50, Number(options.limit ?? 20)) +
                '&offset=' +
                Number(options.offset ?? 0),
            ),
          ),
          playlist,
        ),
      getPlaylist: async (id) =>
        playlist(
          await this.call('playlistRead', () =>
            this.client.request('/playlists/' + parseSpotifyIdentifier(id, 'playlist').id),
          ),
        ),
      getPlaylistTracks: async (id, options = {}) => {
        const result: any = await this.call('playlistRead', () =>
          this.client.request(
            '/playlists/' +
              parseSpotifyIdentifier(id, 'playlist').id +
              '/items?limit=' +
              Math.min(50, Number(options.limit ?? 20)) +
              '&offset=' +
              Number(options.offset ?? 0),
          ),
        );
        return page(result, (item) => ({ addedAt: item?.added_at, item: track(item?.item) }));
      },
    };
    this.playlistWrite = {
      createPlaylist: async (input: any) => {
        if (input?.collaborative && input?.public)
          throw new Error('A Spotify playlist cannot be both public and collaborative');
        return playlist(
          await this.call('playlistWrite', () =>
            this.client.json('/me/playlists', {
              name: input.name,
              description: input.description ?? '',
              public: input.public ?? false,
              collaborative: input.collaborative ?? false,
            }),
          ),
        );
      },
      addTracks: async (playlistId, trackIds) => {
        const id = parseSpotifyIdentifier(playlistId, 'playlist').id;
        for (const part of chunks(
          trackIds.map((value) => parseSpotifyIdentifier(value, 'track').uri),
        ))
          await this.call('playlistWrite', () =>
            this.client.json('/playlists/' + id + '/items', { uris: part }),
          );
        return { ok: true, added: trackIds.length };
      },
      removeTracks: async (playlistId, trackIds, options = {}) => {
        const id = parseSpotifyIdentifier(playlistId, 'playlist').id;
        const result = await this.call('playlistWrite', () =>
          this.client.request('/playlists/' + id + '/items', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: trackIds.map((value) => ({ uri: parseSpotifyIdentifier(value, 'track').uri })),
              ...options,
            }),
          }),
        );
        return { ok: true, removed: trackIds.length, metadata: result };
      },
      reorderTracks: (playlistId, input) =>
        this.call('playlistWrite', () =>
          this.client.json(
            '/playlists/' + parseSpotifyIdentifier(playlistId, 'playlist').id + '/items',
            input,
            'PUT',
          ),
        ),
      replaceTracks: async (playlistId, trackIds) => {
        const id = parseSpotifyIdentifier(playlistId, 'playlist').id,
          uris = trackIds.map((value) => parseSpotifyIdentifier(value, 'track').uri);
        for (const [index, part] of chunks(uris).entries())
          await this.call('playlistWrite', () =>
            this.client.json(
              '/playlists/' + id + '/items',
              { uris: part },
              index === 0 ? 'PUT' : 'POST',
            ),
          );
        if (!uris.length)
          await this.call('playlistWrite', () =>
            this.client.json('/playlists/' + id + '/items', { uris }, 'PUT'),
          );
        return { ok: true, replaced: trackIds.length };
      },
      updatePlaylist: (playlistId, input) =>
        this.call('playlistWrite', () =>
          this.client.json(
            '/playlists/' + parseSpotifyIdentifier(playlistId, 'playlist').id,
            input,
            'PUT',
          ),
        ),
    };
    this.library = {
      listSavedTracks: async (options = {}) =>
        page(
          await this.call('library', () =>
            this.client.request(
              '/me/tracks?limit=' +
                Math.min(50, Number(options.limit ?? 20)) +
                '&offset=' +
                Number(options.offset ?? 0),
            ),
          ),
          (item) => ({ addedAt: item?.added_at, track: track(item?.track) }),
        ),
      checkSavedTracks: async (trackIds) => {
        const ids = trackIds.map((x) => parseSpotifyIdentifier(x, 'track').id).join(',');
        return this.call('library', () => this.client.request('/me/library/contains?ids=' + ids));
      },
      saveTracks: async (trackIds) => {
        await this.call('library', () =>
          this.client.request(
            '/me/library?uris=' +
              trackIds.map((x) => parseSpotifyIdentifier(x, 'track').uri).join(','),
            { method: 'PUT' },
          ),
        );
        return { ok: true, saved: trackIds.length };
      },
      removeTracks: async (trackIds) => {
        await this.call('library', () =>
          this.client.request(
            '/me/library?uris=' +
              trackIds.map((x) => parseSpotifyIdentifier(x, 'track').uri).join(','),
            { method: 'DELETE' },
          ),
        );
        return { ok: true, removed: trackIds.length };
      },
    };
    this.playback = {
      getCurrentlyPlaying: async () => {
        const value: any = await this.call('playback', () =>
          this.client.request('/me/player/currently-playing'),
        );
        return value
          ? {
              playing: Boolean(value.is_playing),
              progressMs: value.progress_ms,
              item: value.item?.type === 'episode' ? episode(value.item) : track(value.item),
              itemType: value.currently_playing_type,
              context: value.context
                ? { type: value.context.type, uri: value.context.uri }
                : undefined,
            }
          : { playing: false, item: null };
      },
      getPlaybackState: async () =>
        playback(await this.call('playback', () => this.client.request('/me/player'))),
      controlPlayback: (action, input: any = {}) => {
        const paths: Record<string, [string, string]> = {
          pause: ['/me/player/pause', 'PUT'],
          play: ['/me/player/play', 'PUT'],
          next: ['/me/player/next', 'POST'],
          previous: ['/me/player/previous', 'POST'],
          seek: ['/me/player/seek', 'PUT'],
          volume: ['/me/player/volume', 'PUT'],
          transfer: ['/me/player', 'PUT'],
        };
        const target = paths[action];
        if (!target) throw new Error(`Unsupported Spotify playback action: ${action}`);
        const { device_id, ...body } = input,
          query = device_id ? '?device_id=' + encodeURIComponent(device_id) : '';
        return target[1] === 'PUT' && ['play', 'transfer'].includes(action)
          ? this.call('playback', () =>
              this.client.json(
                target[0] + query,
                action === 'transfer' ? { device_ids: [device_id], play: input.play } : body,
                'PUT',
              ),
            )
          : this.call('playback', () =>
              this.client.request(target[0] + query, { method: target[1] }),
            );
      },
    };
    this.history = {
      getRecentlyPlayed: async (options = {}) => {
        const result: any = await this.call('history', () =>
          this.client.request(
            '/me/player/recently-played?limit=' + Math.min(50, Number(options.limit ?? 20)),
          ),
        );
        return page(result, (item) => ({ playedAt: item?.played_at, track: track(item?.track) }));
      },
    };
  }

  private async call<T>(capability: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SpotifyApiError)
        throw new ProviderApiError(
          error.status,
          error.message,
          'spotify',
          this.summary.connectionId,
          {
            retryAfter: error.retryAfter,
            scope: error.scope,
            capability,
            providerCode: error.code,
            cause: error,
          },
        );
      if (error instanceof ProviderApiError) throw error;
      throw error;
    }
  }
}
