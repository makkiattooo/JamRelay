import { describe, expect, it, vi } from 'vitest';
import { YouTubeProviderAdapter } from '../src/youtube/provider-adapter.js';
import { YOUTUBE_QUOTA_COST } from '../src/youtube/client.js';

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
      request: vi
        .fn()
        .mockResolvedValue({ value: { id: 'p1', snippet: { title: 'Mix' } }, quotaCost: 50 }),
    } as any;
    const adapter = new YouTubeProviderAdapter({} as any, client);
    await adapter.playlistWrite.createPlaylist({ name: 'Mix', public: false });
    await adapter.playlistWrite.addTracks('p1', ['v1', 'v2']);
    await adapter.playlistWrite.removeTracks('p1', ['item-1']);
    await adapter.playlistWrite.reorderTracks('p1', { playlist_item_id: 'item-2', position: 0 });
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
      expect.any(Object),
    );
  });

  it('does not expose OAuth credentials in the provider summary', () => {
    const adapter = new YouTubeProviderAdapter({} as any, {} as any);
    expect(adapter.summary.metadata).not.toHaveProperty('clientSecret');
  });
});
