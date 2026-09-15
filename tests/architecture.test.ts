import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getToolSecurityMetadata, hasToolSecurityMetadata } from '../src/mcp/tool-manifest.js';

describe('architecture guardrails', () => {
  it('keeps generic MCP and playlist code independent from SpotifyClient', () => {
    for (const file of [
      'src/mcp/tools.ts',
      'src/mcp/helpers.ts',
      'src/playlists/automation.ts',
      'src/playlists/personalization.ts',
      'src/playlists/state-reader.ts',
      'src/playlists/transfer-execution.ts',
    ]) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/SpotifyClient|spotify\/client/);
    }
  });

  it('fails closed for unknown tool security metadata', () => {
    expect(hasToolSecurityMetadata('future_unregistered_tool')).toBe(false);
    expect(getToolSecurityMetadata('future_unregistered_tool')).toBeUndefined();
    expect(getToolSecurityMetadata('remove_tracks_from_playlist')).toMatchObject({
      permission: 'playlist.destructive',
      readOnly: false,
      destructive: true,
    });
  });
});
