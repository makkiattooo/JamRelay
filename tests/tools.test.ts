import { registerPlaylistAutomationTools } from '../src/playlists/automation.js';
import { it, expect } from 'vitest';
import { REQUIRED_TOOL_NAMES, SMART_PLAYLIST_TOOL_NAMES } from '../src/mcp/tools.js';
it('defines exactly the required base MCP tools without duplicates', () => {
  expect(REQUIRED_TOOL_NAMES).toHaveLength(39);
  expect(new Set([...REQUIRED_TOOL_NAMES, ...SMART_PLAYLIST_TOOL_NAMES]).size).toBe(52);
});

it('uses actual source/target playlist identifiers for automation previews', async () => {
  const tools = new Map<string, (args: any) => Promise<any>>();
  const paths: string[] = [];
  registerPlaylistAutomationTools(
    { registerTool: (name: string, _config: unknown, callback: any) => tools.set(name, callback) },
    {
      request: async (path: string) => {
        paths.push(path);
        return (path.includes('/items') ? { items: [] } : { name: 'Fixture' }) as any;
      },
      json: async () => {
        throw new Error('Preview must never write');
      },
    },
  );
  const source = 'A'.repeat(22),
    target = 'B'.repeat(22);
  expect(
    (await tools.get('playlist_rules_engine')!({ playlist_id: source, rules: [], dry_run: true }))
      .structuredContent.violation_count,
  ).toBe(0);
  expect(
    (
      await tools.get('sync_playlists')!({
        source_playlist_id: source,
        target_playlist_id: target,
        mode: 'append_missing',
        dry_run: true,
      })
    ).structuredContent.affected_playlists,
  ).toEqual([target]);
  expect(paths).toContain('/playlists/' + source);
  expect(paths).toContain('/playlists/' + target);
});
