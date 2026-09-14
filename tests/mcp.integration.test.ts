import { describe, it, expect } from 'vitest';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import {
  registerTools,
  REQUIRED_TOOL_NAMES,
  SMART_PLAYLIST_TOOL_NAMES,
  PLAYLIST_AUTOMATION_TOOL_NAMES,
  PLAYLIST_PERSONALIZATION_TOOL_NAMES,
} from '../src/mcp/tools.js';
import { createApp } from '../src/index.js';
function wire(raw: string) {
  if (raw.trimStart().startsWith('event:')) {
    const data = raw.split('\n').find((x) => x.startsWith('data:'));
    return JSON.parse((data ?? 'data:{}').slice(5).trim());
  }
  return JSON.parse(raw);
}
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
  return wire(await response.text());
}
describe('MCP handler', () => {
  it('initializes, lists tools, and invokes a mocked tool', async () => {
    const handler = createMcpHandler(
      () => {
        const s = new McpServer({ name: 'test', version: '1' });
        s.registerTool(
          'mock_ping',
          { title: 'Mock ping', description: 'test', inputSchema: {} },
          async () => ({ content: [{ type: 'text', text: 'pong' }] }),
        );
        return s;
      },
      { legacy: 'stateless', responseMode: 'json' },
    );
    const init = await rpc(handler, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    });
    expect(init.result?.serverInfo?.name ?? init.error).toBe('test');
    const listed = await rpc(handler, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    expect(listed.result.tools.some((x: any) => x.name === 'mock_ping')).toBe(true);
    const called = await rpc(handler, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'mock_ping', arguments: {} },
    });
    expect(called.result.content[0].text).toBe('pong');
  });
});
it('exposes exactly the required tools through tools/list', async () => {
  const handler = createMcpHandler(
    () => {
      const s = new McpServer({ name: 'spotify', version: '1' });
      registerTools(s, { request: async () => ({}), json: async () => ({}) } as any);
      return s;
    },
    { legacy: 'stateless' },
  );
  const listed = await rpc(handler, { jsonrpc: '2.0', id: 10, method: 'tools/list', params: {} });
  const names = listed.result.tools.map((x: any) => x.name);
  expect(names).toHaveLength(106);
  expect(new Set(names).size).toBe(106);
  expect(names.sort()).toEqual(
    [
      ...REQUIRED_TOOL_NAMES,
      ...SMART_PLAYLIST_TOOL_NAMES,
      ...PLAYLIST_AUTOMATION_TOOL_NAMES,
      ...PLAYLIST_PERSONALIZATION_TOOL_NAMES,
      'get_connections',
      'get_capabilities',
      'preview_playlist_import',
      'import_playlist',
      'export_playlist',
      'plan_playlist_transfer',
      'execute_playlist_transfer',
      'sync_playlist_transfer',
      'chapterize_playlist',
      'get_playlist_chapters',
      'play_playlist_chapter',
      'resume_playlist_chapter',
    ].sort(),
  );
  const add = listed.result.tools.find((x: any) => x.name === 'add_tracks_to_playlist');
  const search = listed.result.tools.find((x: any) => x.name === 'search_tracks');
  expect(add.annotations.readOnlyHint).toBe(false);
  expect(search.annotations.readOnlyHint).toBe(true);
});
it('serves the real Express app with bearer auth and MCP v2 discovery/calls', async () => {
  const cfg: any = {
    SPOTIFY_CLIENT_ID: 'id',
    SPOTIFY_CLIENT_SECRET: 'secret',
    SPOTIFY_REDIRECT_URI: 'https://example.com/cb',
    TOKEN_ENCRYPTION_KEY: 'unused',
    PORT: 0,
    HOST: '127.0.0.1',
    PUBLIC_BASE_URL: 'http://localhost',
    LOG_LEVEL: 'silent',
    MCP_AUTH_MODE: 'bearer',
    MCP_API_KEY: 'test-key',
    TRUST_PROXY: 'false',
    SPOTIFY_MARKET: 'PL',
  };
  const app = createApp(cfg, {
    auth: { connected: async () => false } as any,
    client: { request: async () => null, json: async () => null } as any,
    logger: { info() {}, warn() {} } as any,
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address() as any;
    const url = 'http://127.0.0.1:' + address.port + '/mcp';
    const modernMeta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': {},
    };
    let response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(response.status).toBe(401);
    response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-key',
        'Mcp-Method': 'server/discover',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'server/discover',
        params: { _meta: modernMeta },
      }),
    });
    expect(response.status).toBe(200);
    const discovery: any = wire(await response.text());
    expect(discovery.result.resultType).toBe('complete');
    expect(discovery.result.supportedVersions).toContain('2026-07-28');
    response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-key',
        'Mcp-Method': 'tools/list',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
        params: { _meta: modernMeta },
      }),
    });
    expect(response.status).toBe(200);
    const listed: any = wire(await response.text());
    expect(listed.result.tools).toHaveLength(106);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
