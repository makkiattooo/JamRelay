import type { MusicCandidate } from '../music/normalize.js';
import type {
  CatalogCapability,
  IdentityCapability,
  PlaylistReadCapability,
  PlaylistWriteCapability,
} from '../providers/capabilities.js';
import type { ProviderConnection } from '../providers/types.js';
import { SoundCloudAuth } from './auth.js';
import { SoundCloudClient } from './client.js';

const id = (value: string) =>
  value.replace(/^soundcloud:(?:track|playlist):/, '').replace(/^https?:\/\/soundcloud\.com\//, '');
const numericId = (value: string) => {
  const normalized = id(value);
  if (!/^\d+$/.test(normalized))
    throw new Error('SoundCloud track IDs must be numeric resource IDs or supported URLs.');
  return normalized;
};
const track = (x: any): MusicCandidate | null =>
  x?.id != null && x?.title
    ? {
        id: String(x.id),
        name: String(x.title),
        artists: [
          {
            id: x.user?.id == null ? undefined : String(x.user.id),
            name: String(x.user?.username ?? x.user?.permalink ?? ''),
          },
        ],
        metadata: {
          providerUri: x.permalink_url,
          providerUrl: x.permalink_url,
          durationMs: x.duration,
          artworkUrl: x.artwork_url,
          mediaType: 'track',
        },
      }
    : null;
const playlist = (x: any) => ({
  id: x?.id == null ? undefined : String(x.id),
  name: x?.title,
  description: x?.description,
  public: x?.sharing !== 'private',
  trackCount: x?.track_count ?? x?.tracks?.length,
  metadata: {
    providerUri: x?.permalink_url,
    providerUrl: x?.permalink_url,
    providerRevision: x?.last_modified,
  },
});
const page = (x: any, map: (value: any) => unknown) => ({
  items: (x?.collection ?? x?.items ?? []).map(map),
  total: x?.total_results ?? x?.total,
  limit: x?.limit,
  offset: x?.offset,
  next: x?.next_href,
});
export type SoundCloudAdapterOptions = { connectionId?: string; displayName?: string };
export class SoundCloudProviderAdapter implements ProviderConnection {
  readonly summary;
  readonly identity: IdentityCapability;
  readonly catalog: CatalogCapability;
  readonly playlistRead: PlaylistReadCapability;
  readonly playlistWrite: PlaylistWriteCapability;
  constructor(
    private readonly auth: SoundCloudAuth,
    private readonly client = new SoundCloudClient(auth),
    options: SoundCloudAdapterOptions = {},
  ) {
    const connectionId = options.connectionId ?? 'soundcloud-default';
    this.summary = {
      connectionId,
      provider: 'soundcloud',
      displayName: options.displayName ?? 'SoundCloud',
      capabilities: { identity: true, catalog: true, playlistRead: true, playlistWrite: true },
      metadata: { provider: 'soundcloud' },
    };
    this.identity = {
      getCurrentUser: async () => {
        const x: any = await this.client.request('/me');
        return {
          id: x.id,
          displayName: x.username,
          metadata: { providerPermalink: x.permalink_url },
        };
      },
    };
    this.catalog = {
      searchTracks: async (query, options = {}) =>
        page(
          await this.client.request(
            '/tracks?' +
              new URLSearchParams({
                q: query,
                limit: String(Math.min(50, Number(options.limit ?? 20))),
                offset: String(Number(options.offset ?? 0)),
              }),
          ),
          track,
        ).items.filter(Boolean) as MusicCandidate[],
      getTrack: async (value) =>
        track(
          await this.client.request(
            /^https?:\/\//.test(value)
              ? '/resolve?url=' + encodeURIComponent(value)
              : '/tracks/' + encodeURIComponent(numericId(value)),
          ),
        ),
    };
    this.playlistRead = {
      listPlaylists: async (options = {}) =>
        page(
          await this.client.request(
            '/me/playlists?' +
              new URLSearchParams({
                limit: String(Math.min(50, Number(options.limit ?? 20))),
                offset: String(Number(options.offset ?? 0)),
              }),
          ),
          playlist,
        ),
      getPlaylist: async (value) =>
        playlist(
          await this.client.request(
            '/playlists/' + encodeURIComponent(id(value)) + '?show_tracks=true',
          ),
        ),
      getPlaylistTracks: async (value) => {
        const x: any = await this.client.request(
          '/playlists/' + encodeURIComponent(id(value)) + '/tracks',
        );
        return page(x, (item) => ({ addedAt: undefined, item: track(item) }));
      },
    };
    const update = async (playlistId: string, tracks: string[], metadata: any = {}) =>
      this.client.request('/playlists/' + encodeURIComponent(id(playlistId)), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlist: {
            ...metadata,
            tracks: tracks.map((value) => ({ id: Number(numericId(value)) })),
          },
        }),
      });
    this.playlistWrite = {
      createPlaylist: async (input: any) =>
        playlist(
          await this.client.request('/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playlist: {
                title: input.name,
                description: input.description ?? '',
                sharing: input.public ? 'public' : 'private',
                tracks: (input.trackIds ?? []).map((value: string) => ({
                  id: Number(numericId(value)),
                })),
              },
            }),
          }),
        ),
      addTracks: async (playlistId, trackIds) => {
        const current: any = await this.client.request(
          '/playlists/' + encodeURIComponent(id(playlistId)) + '?show_tracks=true',
        );
        await update(
          playlistId,
          [...(current.tracks ?? []).map((x: any) => String(x.id)), ...trackIds],
          { title: current.title, description: current.description, sharing: current.sharing },
        );
        return { ok: true, added: trackIds.length };
      },
      removeTracks: async (playlistId, trackIds) => {
        const current: any = await this.client.request(
          '/playlists/' + encodeURIComponent(id(playlistId)) + '?show_tracks=true',
        );
        const remove = new Set(trackIds.map(id));
        await update(
          playlistId,
          (current.tracks ?? [])
            .map((x: any) => String(x.id))
            .filter((x: string) => !remove.has(x)),
        );
        return { ok: true, removed: trackIds.length };
      },
      reorderTracks: async (playlistId, input: any) => {
        const current: any = await this.client.request(
          '/playlists/' + encodeURIComponent(id(playlistId)) + '?show_tracks=true',
        );
        const tracks = (current.tracks ?? []).map((x: any) => String(x.id));
        const start = Number(input.range_start ?? 0),
          length = Number(input.range_length ?? 1),
          moved = tracks.splice(start, length);
        tracks.splice(Number(input.insert_before ?? 0), 0, ...moved);
        await update(playlistId, tracks);
        return { ok: true };
      },
      replaceTracks: async (playlistId, trackIds) => {
        await update(playlistId, trackIds);
        return { ok: true, replaced: trackIds.length };
      },
      updatePlaylist: async (playlistId, input: any) => {
        const current: any = await this.client.request(
          '/playlists/' + encodeURIComponent(id(playlistId)),
        );
        return update(
          playlistId,
          (current.tracks ?? []).map((x: any) => String(x.id)),
          {
            title: input.name ?? input.title ?? current.title,
            description: input.description ?? current.description,
            sharing:
              input.public === undefined ? current.sharing : input.public ? 'public' : 'private',
          },
        );
      },
    };
  }
}
