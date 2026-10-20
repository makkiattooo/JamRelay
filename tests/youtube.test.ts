import { describe, expect, it, vi } from 'vitest';
import { YouTubeProviderAdapter } from '../src/youtube/provider-adapter.js';
import { YouTubeClient, YOUTUBE_QUOTA_COST } from '../src/youtube/client.js';

describe('official YouTube Data API provider', () => {
  it('declares video semantics and explicit Data API quota costs', async () => {
    const client = {
      request: vi.fn().mockResolvedValue({
        value: {
          items: [
            {
              id: { videoId: 'v1' },
              snippet: { title: 'Official song video', channelTitle: 'Artist' },
            },
          ],
        },
        quotaCost: 100,
      }),
    } as any;
    const adapter = new YouTubeProviderAdapter({} as any, client);
    expect(adapter.summary).toMatchObject({
      provider: 'youtube',
      capabilities: { catalog: true, playlistRead: true, playlistWrite: true },
      metadata: { itemKind: 'video' },
    });
    expect(adapter.summary.capabilities.playlistOperations?.replace).toBe(false);
    const result = await adapter.catalog.searchTracks('song');
    expect(result[0]).toMatchObject({ id: 'v1', metadata: { providerItemKind: 'video' } });
    expect(client.request).toHaveBeenCalledWith(
      'search.list',
      expect.objectContaining({ type: 'video' }),
    );
    expect(YOUTUBE_QUOTA_COST['search.list']).toBe(1);
  });

  it('uses playlist and playlistItems request shapes', async () => {
    const client = {
      request: vi.fn().mockImplementation(async (method: string) => ({
        value:
          method === 'playlistItems.list'
            ? {
                items: [1, 2].map((i) => ({
                  id: `item-${i}`,
                  contentDetails: { videoId: `v${i}` },
                  snippet: { resourceId: { kind: 'youtube#video', videoId: `v${i}` } },
                })),
              }
            : method === 'playlists.list'
              ? {
                  items: [
                    {
                      id: 'p1',
                      snippet: { title: 'Mix', description: 'Keep' },
                      status: { privacyStatus: 'public' },
                    },
                  ],
                }
              : { id: 'p1', snippet: { title: 'Mix' } },
        quotaCost: 50,
      })),
    } as any;
    const adapter = new YouTubeProviderAdapter({} as any, client);
    await adapter.playlistWrite.createPlaylist({ name: 'Mix', public: false });
    await adapter.playlistWrite.addTracks('p1', ['v1', 'v2']);
    await adapter.playlistWrite.removeTracks('p1', ['v1']);
    await adapter.playlistWrite.reorderTracks('p1', { range_start: 1, insert_before: 0 });
    await adapter.playlistWrite.updatePlaylist('p1', { name: 'Updated', public: true });
    expect(client.request).toHaveBeenNthCalledWith(
      1,
      'playlists.insert',
      { part: 'snippet,status' },
      expect.objectContaining({ status: { privacyStatus: 'private' } }),
    );
    expect(client.request).toHaveBeenNthCalledWith(
      2,
      'playlistItems.insert',
      { part: 'snippet' },
      expect.objectContaining({
        snippet: expect.objectContaining({
          playlistId: 'p1',
          resourceId: { kind: 'youtube#video', videoId: 'v1' },
        }),
      }),
    );
    expect(client.request).toHaveBeenCalledWith(
      'playlists.update',
      { part: 'snippet,status' },
      expect.any(Object),
    );
    expect(client.request).toHaveBeenCalledWith('playlistItems.delete', { id: 'item-1' });
    expect(client.request).toHaveBeenCalledWith(
      'playlistItems.update',
      { part: 'snippet' },
      {
        id: 'item-2',
        snippet: {
          playlistId: 'p1',
          position: 0,
          resourceId: { kind: 'youtube#video', videoId: 'v2' },
        },
      },
    );
    client.request.mockClear();
    await expect(adapter.playlistWrite.removeTracks('p1', ['foreign-item'])).rejects.toMatchObject({
      status: 400,
    });
    expect(client.request).not.toHaveBeenCalledWith('playlistItems.delete', expect.anything());
    await adapter.playlistWrite.updatePlaylist('p1', { description: 'Changed' });
    expect(client.request).toHaveBeenCalledWith(
      'playlists.update',
      expect.anything(),
      expect.objectContaining({
        snippet: { title: 'Mix', description: 'Changed' },
        status: { privacyStatus: 'public' },
      }),
    );
  });

  it('does not expose OAuth credentials in the provider summary', () => {
    const adapter = new YouTubeProviderAdapter({} as any, {} as any);
    expect(adapter.summary.metadata).not.toHaveProperty('clientSecret');
  });
});

it('uses the actual YouTube REST resource path, not the logical method name', async () => {
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{"items":[]}', { status: 200 }));
  try {
    await new YouTubeClient({ accessToken: async () => 'test' } as any).request('search.list', {
      q: 'music',
    });
    expect(String(fetcher.mock.calls[0][0])).toBe(
      'https://www.googleapis.com/youtube/v3/search?q=music',
    );
    fetcher.mockResolvedValueOnce(new Response('not-json', { status: 200 }));
    await expect(
      new YouTubeClient({ accessToken: async () => 'test' } as any).request('search.list'),
    ).rejects.toMatchObject({ status: 502 });
  } finally {
    fetcher.mockRestore();
  }
});
