import { afterEach, describe, it, expect, vi } from 'vitest';
import { SpotifyClient } from '../src/spotify/client.js';
import { SpotifyApiError } from '../src/spotify/errors.js';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { registerTools } from '../src/mcp/tools.js';

const auth = { accessToken: vi.fn(async () => 'access-token') };
const client = () => new SpotifyClient(auth as any);
afterEach(() => vi.restoreAllMocks());
async function response(status: number, body: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(status === 204 ? null : body, {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
  return client().request('/test');
}
async function endpoint(method: string, path: string, status: number, body: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(status === 204 ? null : body, {
          status,
          headers: { 'content-type': 'text/plain', 'content-length': String(body.length) },
        }),
    ),
  );
  return client().request(path, { method });
}
describe('SpotifyClient successful response parsing', () => {
  it('returns null for 200 empty body', async () => expect(await response(200, '')).toBeNull());
  it('returns null for 200 whitespace body', async () =>
    expect(await response(200, '  \n\t')).toBeNull());
  it('parses valid JSON for 200', async () =>
    expect(await response(200, '{"ok":true}')).toEqual({ ok: true }));
  it('parses valid JSON for 201', async () =>
    expect(await response(201, '{"created":true}')).toEqual({ created: true }));
  it('returns null for 202 empty body', async () => expect(await response(202, '')).toBeNull());
  it('returns null for 204', async () => expect(await response(204, '')).toBeNull());
  it('accepts non-JSON success bodies for known player mutations', async () => {
    for (const [method, path] of [
      ['PUT', '/me/player/play'],
      ['PUT', '/me/player/pause'],
      ['POST', '/me/player/next'],
    ])
      await expect(endpoint(method, path, 200, 'OK')).resolves.toBeNull();
  });
  it('keeps strict invalid JSON handling for player reads', async () => {
    await expect(endpoint('GET', '/me/player', 200, 'not-json')).rejects.toMatchObject({
      code: 'invalid_json',
    });
  });
  it('keeps strict invalid JSON handling for playlist creation', async () => {
    await expect(endpoint('POST', '/me/playlists', 201, 'not-json')).rejects.toMatchObject({
      code: 'invalid_json',
    });
  });
  it('throws normalized invalid_json for non-empty invalid JSON', async () => {
    await expect(response(200, 'not-json')).rejects.toMatchObject({
      status: 200,
      code: 'invalid_json',
      message: 'Spotify returned invalid JSON.',
    });
  });
  it('preserves 403 with an empty body', async () => {
    await expect(response(403, '')).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
      message: 'Spotify API returned HTTP 403 with an empty response body.',
    });
  });
  it('preserves Spotify JSON error details', async () => {
    await expect(
      response(403, '{"error":{"status":403,"message":"Restricted","reason":"PREMIUM_REQUIRED"}}'),
    ).rejects.toMatchObject({ status: 403, code: 'PREMIUM_REQUIRED', message: 'Restricted' });
  });
  it('preserves 403 for a non-JSON body instead of reporting invalid_json', async () => {
    await expect(response(403, 'Forbidden')).rejects.toMatchObject({
      status: 403,
      code: 'http_403',
      message: 'Forbidden',
    });
  });
  it('returns a successful null MCP result for pause with 200 empty body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
    const handler = createMcpHandler(
      () => {
        const s = new McpServer({ name: 'test', version: '1' });
        registerTools(s, client());
        return s;
      },
      { legacy: 'stateless' },
    );
    const r = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'pause', arguments: {} },
        }),
      }),
    );
    const raw = await r.text();
    const data = raw.split('\n').find((x) => x.startsWith('data:'));
    const body: any = JSON.parse((data ?? raw).replace(/^data:\s*/, '').trim());
    expect(body.result.isError).not.toBe(true);
    expect(body.result.content[0].text).toBe('null');
  });
});
