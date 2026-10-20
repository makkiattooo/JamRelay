import type { MusicCandidate } from '../music/normalize.js';
import type { ProviderConnection } from '../providers/types.js';
import type { YouTubeAuth } from './auth.js';
import { YouTubeClient } from './client.js';
import { ProviderApiError, CapabilityUnavailableError } from '../providers/errors.js';
import { mapLimit } from '../utils/concurrency.js';
const video = (x: any): MusicCandidate | null => {
  const s = x?.snippet ?? {};
  const id = x?.id?.videoId ?? x?.contentDetails?.videoId ?? x?.id;
  return id && s.title
    ? {
        id: String(id),
        name: String(s.title),
        artists: [{ name: String(s.channelTitle ?? '') }],
        metadata: {
          provider: 'youtube',
          providerItemKind: 'video',
          providerUri: `https://www.youtube.com/watch?v=${id}`,
          providerUrl: `https://www.youtube.com/watch?v=${id}`,
          description: s.description,
        },
      }
    : null;
};
const playlist = (x: any) => ({
  id: x?.id,
  name: x?.snippet?.title,
  description: x?.snippet?.description,
  public: x?.status?.privacyStatus === 'public',
  metadata: {
    providerItemKind: 'playlist',
    providerUri: x?.id ? `https://www.youtube.com/playlist?list=${x.id}` : undefined,
  },
});
export class YouTubeProviderAdapter implements ProviderConnection {
  async isAuthorized() {
    return this.auth?.connected ? this.auth.connected() : true;
  }
  readonly summary;
  readonly catalog;
  readonly playlistRead;
  readonly playlistWrite;
  readonly client;
  constructor(
    private readonly auth: YouTubeAuth,
    client = new YouTubeClient(auth),
    connectionId = 'youtube-default',
  ) {
    this.client = client;
    this.summary = {
      connectionId,
      provider: 'youtube',
      capabilities: {
        catalog: true,
        playlistRead: true,
        playlistWrite: true,
        playlistOperations: {
          create: true,
          add: true,
          remove: true,
          reorder: true,
          replace: false,
          update: true,
        },
      },
      metadata: { itemKind: 'video', quotaModel: 'YouTube Data API units' },
    };
    this.catalog = {
      searchTracks: async (query: string, options: any = {}) => {
        const r: any = await this.client.request('search.list', {
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults: Math.min(25, options.limit ?? 20),
        });
        return (r.value.items ?? []).map(video).filter(Boolean) as MusicCandidate[];
      },
      getTrack: async (id: string) => {
        const r: any = await this.client.request('videos.list', { part: 'snippet', id });
        return video(r.value.items?.[0]);
      },
    };
    this.playlistRead = {
      listPlaylists: async (options: any = {}) =>
        this.client
          .request('playlists.list', {
            part: 'snippet,status',
            mine: true,
            maxResults: Math.min(50, options.limit ?? 20),
            pageToken: options.pageToken,
          })
          .then((r) => ({
            items: (r.value.items ?? []).map(playlist),
            next: r.value.nextPageToken,
            quota_cost: r.quotaCost,
          })),
      getPlaylist: async (id: string) =>
        this.client.request('playlists.list', { part: 'snippet,status', id }).then((r) => {
          if (!r.value.items?.[0])
            throw new ProviderApiError(404, 'Playlist not found', 'youtube', connectionId);
          return playlist(r.value.items[0]);
        }),
      getPlaylistTracks: async (id: string, options: any = {}) =>
        this.client
          .request('playlistItems.list', {
            part: 'snippet,contentDetails',
            playlistId: id,
            maxResults: Math.min(50, options.limit ?? 50),
            pageToken: options.pageToken,
          })
          .then((r: any) => ({
            items: (r.value.items ?? [])
              .map((x: any) => ({ item: video(x) }))
              .filter((x: any) => x.item),
            next: r.value.nextPageToken,
            quota_cost: r.quotaCost,
          })),
    };
    const playlistItems = async (playlistId: string) => {
      const items: any[] = [];
      const seen = new Set<string>();
      let pageToken: string | undefined;
      do {
        const { value } = await this.client.request('playlistItems.list', {
          part: 'snippet,contentDetails',
          playlistId,
          maxResults: 50,
          pageToken,
        });
        items.push(...(value.items ?? []));
        pageToken = value.nextPageToken;
        if (pageToken && seen.has(pageToken)) throw new Error('youtube_pagination_cycle');
        if (pageToken) seen.add(pageToken);
      } while (pageToken);
      return items;
    };
    const invalidItem = () =>
      new ProviderApiError(
        400,
        'Playlist item or position does not belong to the selected playlist',
        'youtube',
        connectionId,
      );
    this.playlistWrite = {
      createPlaylist: async (input: any) =>
        this.client
          .request(
            'playlists.insert',
            { part: 'snippet,status' },
            {
              snippet: { title: input.name, description: input.description ?? '' },
              status: { privacyStatus: input.public ? 'public' : 'private' },
            },
          )
          .then((r) => playlist(r.value)),
      addTracks: async (id: string, ids: string[]) =>
        // YouTube assigns playlist positions in insertion order; serialize
        // ordered inserts instead of trading correctness for throughput.
        mapLimit(ids, { concurrency: 1 }, (videoId) =>
          this.client.request(
            'playlistItems.insert',
            { part: 'snippet' },
            { snippet: { playlistId: id, resourceId: { kind: 'youtube#video', videoId } } },
          ),
        ).then(() => ({ added: ids.length, quota_cost: ids.length * 50 })),
      removeTracks: async (playlistId: string, ids: string[]) => {
        const items = await playlistItems(playlistId);
        const selected = items.filter(
          (item) => ids.includes(item.contentDetails?.videoId) || ids.includes(item.id),
        );
        if (
          ids.some(
            (id) => !selected.some((item) => item.id === id || item.contentDetails?.videoId === id),
          )
        )
          throw invalidItem();
        await mapLimit(selected, { concurrency: 1 }, (item) =>
          this.client.request('playlistItems.delete', { id: item.id }),
        );
        return { removed: selected.length, quota_cost: selected.length * 50 };
      },
      reorderTracks: async (playlistId: string, input: any) => {
        if ((input.range_length ?? 1) !== 1)
          throw new CapabilityUnavailableError(
            'playlist.reorder.multiple',
            'youtube',
            connectionId,
          );
        const items = await playlistItems(playlistId);
        const itemId = input.playlist_item_id ?? input.id;
        const index = itemId
          ? items.findIndex((item) => item.id === itemId)
          : Number(input.range_start);
        const destination = Number(input.insert_before ?? input.position);
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= items.length ||
          !Number.isInteger(destination) ||
          destination < 0 ||
          destination > items.length
        )
          throw invalidItem();
        const item = items[index];
        const position =
          input.insert_before !== undefined && destination > index ? destination - 1 : destination;
        return this.client.request(
          'playlistItems.update',
          { part: 'snippet' },
          {
            id: item.id,
            snippet: {
              playlistId,
              position,
              resourceId: item.snippet.resourceId ?? {
                kind: 'youtube#video',
                videoId: item.contentDetails.videoId,
              },
            },
          },
        );
      },
      replaceTracks: async () => {
        throw new Error('youtube_playlist_replace_unsupported');
      },
      updatePlaylist: async (id: string, input: any) => {
        const { value } = await this.client.request('playlists.list', {
          part: 'snippet,status',
          id,
        });
        const current = value.items?.[0];
        if (!current)
          throw new ProviderApiError(404, 'Playlist not found', 'youtube', connectionId);
        return this.client
          .request(
            'playlists.update',
            { part: 'snippet,status' },
            {
              id,
              snippet: {
                title: input.name ?? current.snippet.title,
                description: input.description ?? current.snippet.description ?? '',
              },
              status: {
                privacyStatus:
                  input.public === undefined
                    ? current.status.privacyStatus
                    : input.public
                      ? 'public'
                      : 'private',
              },
            },
          )
          .then((r) => playlist(r.value));
      },
    };
  }
}
