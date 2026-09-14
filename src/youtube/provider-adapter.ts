import type { MusicCandidate } from '../music/normalize.js';
import type { ProviderConnection } from '../providers/types.js';
import type { YouTubeAuth } from './auth.js';
import { YouTubeClient } from './client.js';
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
      capabilities: { catalog: true, playlistRead: true, playlistWrite: true },
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
        this.client
          .request('playlists.list', { part: 'snippet,status', id })
          .then((r) => playlist(r.value.items?.[0])),
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
        Promise.all(
          ids.map((videoId) =>
            this.client.request(
              'playlistItems.insert',
              { part: 'snippet' },
              { snippet: { playlistId: id, resourceId: { kind: 'youtube#video', videoId } } },
            ),
          ),
        ).then(() => ({ added: ids.length, quota_cost: ids.length * 50 })),
      removeTracks: async (_playlistId: string, itemIds: string[]) => {
        await Promise.all(
          itemIds.map((itemId) => this.client.request('playlistItems.delete', { id: itemId })),
        );
        return { removed: itemIds.length, quota_cost: itemIds.length * 50 };
      },
      reorderTracks: async (playlistId: string, input: any) => {
        const itemId = String(input.playlist_item_id ?? input.id ?? '');
        if (!itemId) throw new Error('youtube_playlist_item_id_required');
        return this.client.request(
          'playlistItems.update',
          { part: 'snippet' },
          { id: itemId, snippet: { playlistId, position: Number(input.position) } },
        );
      },
      replaceTracks: async () => {
        throw new Error('youtube_playlist_replace_unsupported');
      },
      updatePlaylist: async (id: string, input: any) =>
        this.client
          .request(
            'playlists.update',
            { part: 'snippet,status' },
            {
              id,
              snippet: { title: input.name, description: input.description ?? '' },
              status: { privacyStatus: input.public ? 'public' : 'private' },
            },
          )
          .then((r) => playlist(r.value)),
    };
  }
}
