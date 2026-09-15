import { afterEach, describe, expect, it, vi } from 'vitest';
import { YouTubeAuth, type YouTubeToken } from '../src/youtube/auth.js';

describe('YouTube token refresh', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shares one refresh request across concurrent expired-token reads', async () => {
    let token: YouTubeToken = {
      accessToken: 'expired',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1,
    };
    const store = {
      load: vi.fn(async () => token),
      save: vi.fn(async (_id: string, next: YouTubeToken) => {
        token = next;
      }),
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ access_token: 'fresh', refresh_token: 'refresh', expires_in: 3600 }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const auth = new YouTubeAuth(
      { clientId: 'client', clientSecret: 'secret', redirectUri: 'https://example.test/callback' },
      store as any,
    );
    const values = await Promise.all(Array.from({ length: 20 }, () => auth.accessToken()));
    expect(new Set(values)).toEqual(new Set(['fresh']));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});
