import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from '../src/providers/registry.js';
import { registerTools, toolsetIncludes } from '../src/mcp/tools.js';

const connection = (connectionId: string, provider: string, capabilities: any) => ({
  summary: { connectionId, provider, capabilities },
});

function registered(registry: ProviderRegistry, toolset: any = 'all') {
  const tools = new Map<string, { config: any; callback: (input: any) => Promise<any> }>();
  const server = {
    registerTool(name: string, config: any, callback: (input: any) => Promise<any>) {
      tools.set(name, { config, callback });
    },
  };
  registerTools(server as any, {} as any, undefined, false, registry, toolset);
  return tools;
}

describe('MCP provider control surface and toolsets', () => {
  it('keeps all tools in the default profile and composes focused profiles', () => {
    expect(toolsetIncludes('all', 'search_tracks')).toBe(true);
    expect(toolsetIncludes('all', 'remove_tracks_from_playlist')).toBe(true);
    expect(toolsetIncludes('core', 'search_tracks')).toBe(true);
    expect(toolsetIncludes('core', 'smart_shuffle_playlist')).toBe(false);
    expect(toolsetIncludes('personalization', 'rank_playlist_tracks')).toBe(true);
    expect(toolsetIncludes('personalization', 'search_tracks')).toBe(false);
  });

  it('exposes connections without credentials and reports capabilities', async () => {
    const registry = new ProviderRegistry();
    registry.register(
      connection('spotify-default', 'spotify', { catalog: true, playlistWrite: true }) as any,
    );
    registry.register(
      connection('beta-main', 'beta', { catalog: true, playlistWrite: false }) as any,
    );
    const tools = registered(registry, 'core');
    const connections = await tools.get('get_connections')!.callback({});
    const payload = connections.structuredContent as any[];
    expect(payload).toHaveLength(2);
    expect(JSON.stringify(payload)).not.toMatch(/token|secret|credential/i);
    expect(payload[0]).toMatchObject({ connection_id: 'spotify-default', default: true });
    const capabilities = await tools.get('get_capabilities')!.callback({ provider: 'beta' });
    expect(capabilities.structuredContent[0]).toMatchObject({
      provider: 'beta',
      connection_id: 'beta-main',
    });
    expect(capabilities.structuredContent[0].unsupported_operations).toContain('playlistWrite');
  });

  it('rejects contradictory provider and connection targeting before execution', async () => {
    const registry = new ProviderRegistry();
    registry.register(connection('spotify-default', 'spotify', { catalog: true }) as any);
    const tools = registered(registry, 'core');
    await expect(
      tools
        .get('get_capabilities')!
        .callback({ provider: 'beta', connection_id: 'spotify-default' }),
    ).rejects.toThrow('provider_connection_conflict');
  });
});
