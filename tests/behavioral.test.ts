import { describe, it, expect } from 'vitest';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { registerTools } from '../src/mcp/tools.js';
import { SpotifyApiError } from '../src/spotify/errors.js';

async function rpc(handler: any, body: unknown) {
  const response = await handler.fetch(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
    }),
  );
  const raw = await response.text();
  const data = raw.split('\n').find((x) => x.startsWith('data:'));
  return JSON.parse((data ?? raw).replace(/^data:\s*/, '').trim());
}
function handler(client: any) {
  return createMcpHandler(
    () => {
      const s = new McpServer({ name: 'test', version: '1' });
      registerTools(s, client);
      return s;
    },
    { legacy: 'stateless' },
  );
}
const tool = (name: string, arguments_: unknown) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name, arguments: arguments_ },
});
const track = {
  type: 'track',
  id: 't1',
  uri: 'spotify:track:t1',
  name: 'Track',
  artists: [{ id: 'a1', name: 'Artist' }],
  album: { id: 'al1', name: 'Album' },
  duration_ms: 1000,
  explicit: false,
  external_urls: { spotify: 'https://open.spotify.com/track/t1' },
};
const ep = {
  type: 'episode',
  id: 'e1',
  uri: 'spotify:episode:e1',
  name: 'Episode',
  description: 'desc',
  duration_ms: 2000,
  release_date: '2024-01-01',
  show: { id: 's1', name: 'Show', uri: 'spotify:show:s1' },
  external_urls: { spotify: 'https://open.spotify.com/episode/e1' },
};
describe('playback and playlist behavioral correctness', () => {
  it('normalizes track, episode, and no active playback item separately', async () => {
    let item: any = track;
    const h = handler({
      request: async (path: string) =>
        path.includes('currently-playing')
          ? { is_playing: true, item, currenty_playing_type: 'track' }
          : null,
      json: async () => null,
    });
    let result = await rpc(h, tool('get_currently_playing', {}));
    expect(JSON.parse(result.result.content[0].text).item.type).toBeUndefined();
    expect(JSON.parse(result.result.content[0].text).item.id).toBe('t1');
    item = ep;
    result = await rpc(h, tool('get_currently_playing', {}));
    expect(JSON.parse(result.result.content[0].text).item.id).toBe('e1');
    expect(JSON.parse(result.result.content[0].text).item.show.name).toBe('Show');
    item = null;
    result = await rpc(h, tool('get_currently_playing', {}));
    expect(JSON.parse(result.result.content[0].text).item).toBeNull();
  });
  it('starts all-playlist pagination at the supplied offset', async () => {
    const calls: number[] = [];
    const h = handler({
      request: async (path: string) => {
        const offset = Number(new URL('https://x' + path).searchParams.get('offset'));
        calls.push(offset);
        return {
          items: [
            {
              id: String(offset),
              uri: 'spotify:playlist:' + offset,
              name: String(offset),
              items: { total: 1 },
            },
          ],
          next: offset < 120 ? 'https://x/me/playlists?offset=' + (offset + 50) : null,
        };
      },
      json: async () => null,
    });
    const result = await rpc(h, tool('get_my_playlists', { all: true, offset: 40 }));
    expect(calls).toEqual([40, 90, 140]);
    expect(JSON.parse(result.result.content[0].text).items).toHaveLength(3);
  });
  it('does not write collaborative=true unless the existing playlist is private', async () => {
    let writes = 0;
    const h = handler({
      request: async (path: string) => (path.startsWith('/playlists/') ? { public: true } : null),
      json: async () => {
        writes++;
        return null;
      },
    });
    const result = await rpc(
      h,
      tool('update_playlist_details', { playlist_id: 'spotify:playlist:p1', collaborative: true }),
    );
    expect(result.result.isError || result.error).toBeTruthy();
    expect(writes).toBe(0);
  });
  it('verifies play and pause after a 403 and keeps the error when state did not change', async () => {
    let playing = true;
    const fake = {
      request: async (path: string) => {
        if (path === '/me/player') return { is_playing: playing };
        throw new SpotifyApiError(403, 'forbidden', 'Restricted');
      },
      json: async (path: string) => {
        if (path === '/me/player/play') throw new SpotifyApiError(403, 'forbidden', 'Restricted');
        return null;
      },
    };
    let result = await rpc(handler(fake), tool('play', {}));
    expect(JSON.parse(result.result.content[0].text)).toMatchObject({
      ok: true,
      verified_after_error: true,
      spotify_status: 403,
    });
    playing = false;
    result = await rpc(handler(fake), tool('pause', {}));
    expect(JSON.parse(result.result.content[0].text)).toMatchObject({
      ok: true,
      verified_after_error: true,
      spotify_status: 403,
    });
    playing = true;
    result = await rpc(handler(fake), tool('pause', {}));
    expect(result.result.isError).toBe(true);
  });
});
