import type { MusicCandidate } from '../music/normalize.js';
import type { ProviderConnection } from '../providers/types.js';
import type { AppleMusicAuth } from './auth.js';
import { AppleMusicClient } from './client.js';

const resource = (x: any): MusicCandidate | null => {
  const a = x?.attributes;
  return x?.id && a?.name
    ? {
        id: String(x.id),
        name: String(a.name),
        artists: [{ name: String(a.artistName ?? '') }],
        metadata: {
          providerUri: a.url,
          providerUrl: a.url,
          albumName: a.albumName,
          isrc: a.isrc,
          durationMs: a.durationInMillis,
        },
      }
    : null;
};
const playlist = (x: any) => ({
  id: x?.id,
  name: x?.attributes?.name,
  description: x?.attributes?.description?.standard ?? x?.attributes?.description,
  public: x?.attributes?.isPublic,
  metadata: { providerUri: x?.attributes?.url },
});
const items = (x: any) => ({
  items: (x?.data ?? []).map((v: any) => ({ item: resource(v) })).filter((v: any) => v.item),
  total: x?.meta?.total,
});

export class AppleMusicProviderAdapter implements ProviderConnection {
  readonly client: AppleMusicClient;
  readonly summary;
  readonly catalog;
  readonly playlistRead;
  readonly playlistWrite;
  constructor(
    private readonly auth: AppleMusicAuth,
    options: { connectionId?: string; storefront?: string } = {},
    client?: AppleMusicClient,
  ) {
    this.client = client ?? new AppleMusicClient(auth, options.storefront ?? 'us');
    const connectionId = options.connectionId ?? 'apple-music-default';
    this.summary = {
      connectionId,
      provider: 'apple-music',
      capabilities: { catalog: true, playlistRead: false, playlistWrite: false },
      metadata: { storefront: options.storefront ?? 'us', userTokenOnboarded: false },
    };
    this.catalog = {
      searchTracks: async (query: string, opts: any = {}) => {
        const x: any = await this.client.request(
          `/catalog/${this.client.storefrontId()}/search?${new URLSearchParams({ term: query, types: 'songs', limit: String(Math.min(25, opts.limit ?? 20)) })}`,
        );
        return (x.results?.songs?.data ?? []).map(resource).filter(Boolean) as MusicCandidate[];
      },
      getTrack: async (id: string) => {
        const x: any = await this.client.request(
          `/catalog/${this.client.storefrontId()}/songs/${encodeURIComponent(id)}`,
        );
        return resource(x.data?.[0]);
      },
    };
    this.playlistRead = {
      listPlaylists: async () => this.requireUser(`/me/library/playlists`),
      getPlaylist: async (id: string) =>
        this.requireUser(`/me/library/playlists/${encodeURIComponent(id)}`),
      getPlaylistTracks: async (id: string) =>
        items(
          await this.client.request(
            `/me/library/playlists/${encodeURIComponent(id)}/tracks`,
            {},
            true,
          ),
        ),
    };
    this.playlistWrite = {
      createPlaylist: async (input: any) =>
        this.client.request(
          '/me/library/playlists',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              attributes: { name: input.name, description: input.description ?? '' },
              ...(input.trackIds
                ? {
                    relationships: {
                      tracks: { data: input.trackIds.map((id: string) => ({ id, type: 'songs' })) },
                    },
                  }
                : {}),
            }),
          },
          true,
        ),
      addTracks: async (id: string, trackIds: string[]) =>
        this.client.request(
          `/me/library/playlists/${encodeURIComponent(id)}/tracks`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              data: trackIds.map((trackId) => ({ id: trackId, type: 'songs' })),
            }),
          },
          true,
        ),
      removeTracks: async () => {
        throw new Error('apple_music_playlist_remove_unsupported');
      },
      reorderTracks: async () => {
        throw new Error('apple_music_playlist_reorder_unsupported');
      },
      replaceTracks: async () => {
        throw new Error('apple_music_playlist_replace_unsupported');
      },
      updatePlaylist: async () => {
        throw new Error('apple_music_playlist_update_unsupported');
      },
    };
  }
  async refreshCapabilities() {
    const available = Boolean(await this.auth.musicUserToken());
    this.summary.capabilities.playlistRead = available;
    this.summary.capabilities.playlistWrite = available;
    this.summary.metadata = { ...this.summary.metadata, userTokenOnboarded: available };
    return this.summary.capabilities;
  }
  private async requireUser(path: string) {
    return this.client.request(path, {}, true);
  }
}
