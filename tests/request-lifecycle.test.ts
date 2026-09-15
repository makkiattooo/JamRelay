import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotifyClient } from '../src/spotify/client.js';
import { toolContext } from '../src/mcp/context.js';

describe('provider request lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('propagates a cancelled MCP context to the provider fetch', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          if (init.signal?.aborted) {
            reject(new Error('aborted'));
            return;
          }
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new SpotifyClient({ accessToken: async () => 'token' } as any);
    const request = toolContext.run(
      {
        requestId: 'lifecycle-test',
        signal: controller.signal,
        deadlineAt: Date.now() + 10_000,
        operation: 'test',
      },
      () => client.request('/me/player'),
    );
    controller.abort();
    await expect(request).rejects.toThrow('aborted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
