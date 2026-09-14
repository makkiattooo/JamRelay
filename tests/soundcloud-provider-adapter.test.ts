import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundCloudProviderAdapter } from '../src/soundcloud/provider-adapter.js';
import { SoundCloudClient } from '../src/soundcloud/client.js';
import { SoundCloudAuth } from '../src/soundcloud/auth.js';

const auth = { accessToken: vi.fn(async () => 'access-token') } as any;

describe('SoundCloud provider adapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exposes only officially implemented capabilities and normalizes catalog/playlists', async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const client = {
      request: vi.fn(async (path: string, init?: RequestInit) => {
        calls.push({ path, init });
        if (path.startsWith('/tracks?'))
          return {
            collection: [
              { id: 42, title: 'Track', user: { id: 7, username: 'Artist' }, duration: 1234 },
            ],
          };
        if (path === '/me') return { id: 7, username: 'Artist' };
        if (path.startsWith('/me/playlists'))
          return { collection: [{ id: 8, title: 'Set', track_count: 1 }] };
        if (path.includes('/tracks'))
          return { collection: [{ id: 42, title: 'Track', user: { username: 'Artist' } }] };
        return {
          id: 8,
          title: 'Set',
          tracks: [{ id: 42, title: 'Track', user: { username: 'Artist' } }],
        };
      }),
    };
    const adapter = new SoundCloudProviderAdapter(auth, client as any);
    expect(adapter.summary.capabilities).toEqual({
      identity: true,
      catalog: true,
      playlistRead: true,
      playlistWrite: true,
    });
    expect((adapter as any).playback).toBeUndefined();
    expect(await adapter.catalog.searchTracks('Track')).toMatchObject([
      { id: '42', name: 'Track' },
    ]);
    expect(await adapter.identity.getCurrentUser()).toMatchObject({ id: 7, displayName: 'Artist' });
    expect(await adapter.playlistRead.getPlaylist('soundcloud:playlist:8')).toMatchObject({
      id: '8',
      name: 'Set',
    });
    expect(calls.some((x) => x.path === '/playlists/8?show_tracks=true')).toBe(true);
  });

  it('uses SoundCloud OAuth header and does not assume Spotify transport', async () => {
    const fetchMock = vi.fn(
      async (_url: string, init: RequestInit) =>
        new Response(JSON.stringify({ id: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await new SoundCloudClient(auth, 'soundcloud-default').request('/me');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.soundcloud.com/me');
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: 'OAuth access-token',
    });
  });

  it('creates bounded PKCE state and consumes it once', () => {
    const soundCloudAuth = new SoundCloudAuth(
      {
        SOUNDCLOUD_CLIENT_ID: 'client',
        SOUNDCLOUD_CLIENT_SECRET: 'secret',
        SOUNDCLOUD_REDIRECT_URI: 'https://example.test/callback',
      },
      {} as any,
    );
    const login = soundCloudAuth.loginUrl();
    const url = new URL(login.url);
    expect(url.origin + url.pathname).toBe('https://secure.soundcloud.com/authorize');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(soundCloudAuth.verifyState(login.state)).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(() => soundCloudAuth.verifyState(login.state)).toThrow(/Invalid or expired/);
  });
});
