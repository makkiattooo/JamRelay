import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotifyProviderAdapter } from '../src/spotify/provider-adapter.js';
import { SpotifyAuth } from '../src/spotify/auth.js';
import { SpotifyClient } from '../src/spotify/client.js';
import { SpotifyApiError } from '../src/spotify/errors.js';
import { ProviderApiError } from '../src/providers/errors.js';

const auth = { accessToken: async () => 'adapter-token' } as any;
afterEach(() => vi.restoreAllMocks());

describe('SpotifyProviderAdapter', () => {
  it('declares supported capabilities and normalizes catalog output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              tracks: {
                items: [
                  {
                    id: 't1',
                    uri: 'spotify:track:t1',
                    name: 'Song',
                    artists: [{ id: 'a1', name: 'Artist' }],
                    album: { id: 'al1', name: 'Album' },
                    external_urls: { spotify: 'https://open.spotify.com/track/t1' },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      ),
    );
    const adapter = new SpotifyProviderAdapter(
      new SpotifyAuth(
        {
          SPOTIFY_CLIENT_ID: 'id',
          SPOTIFY_CLIENT_SECRET: 'secret',
          SPOTIFY_REDIRECT_URI: 'https://example.com/cb',
        },
        {} as any,
      ),
      new SpotifyClient(auth),
    );
    expect(adapter.summary.capabilities).toEqual({
      identity: true,
      catalog: true,
      playlistRead: true,
      playlistWrite: true,
      library: true,
      playback: true,
      history: true,
    });
    expect(await adapter.catalog.searchTracks('Song')).toEqual([
      {
        id: 't1',
        name: 'Song',
        artists: [{ id: 'a1', name: 'Artist' }],
        album: { id: 'al1', name: 'Album', release_date: undefined },
        metadata: {
          providerUri: 'spotify:track:t1',
          providerUrl: 'https://open.spotify.com/track/t1',
          durationMs: undefined,
          explicit: undefined,
          isrc: undefined,
        },
      },
    ]);
  });

  it('preserves Spotify transport retry and refresh behavior through the wrapped client', async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push(String(init.headers && new Headers(init.headers).get('Authorization')));
        if (requests.length === 1)
          return new Response(JSON.stringify({ error: { message: 'expired' } }), { status: 401 });
        return new Response(JSON.stringify({ id: 't1', name: 'Song', artists: [] }), {
          status: 200,
        });
      }),
    );
    const spotifyAuth = {
      accessToken: vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new'),
    } as any;
    const adapter = new SpotifyProviderAdapter(spotifyAuth, new SpotifyClient(spotifyAuth));
    expect((await adapter.catalog.getTrack('spotify:track:t1'))?.id).toBe('t1');
    expect(requests).toEqual(['Bearer old', 'Bearer new']);
  });

  it('adapts SpotifyApiError to ProviderApiError while retaining context', async () => {
    const client = {
      request: vi
        .fn()
        .mockRejectedValue(new SpotifyApiError(429, 'QUOTA', 'slow', 10, false, 'catalog')),
    } as any;
    const adapter = new SpotifyProviderAdapter(auth, client);
    await expect(adapter.catalog.getTrack('t1')).rejects.toMatchObject({
      status: 429,
      provider: 'spotify',
      connectionId: 'spotify-default',
      retryAfter: 10,
      scope: 'catalog',
      capability: 'catalog',
      providerCode: 'QUOTA',
    });
    await expect(adapter.catalog.getTrack('t1')).rejects.toBeInstanceOf(ProviderApiError);
  });
});
