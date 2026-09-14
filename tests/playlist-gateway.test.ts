import { describe, expect, it } from 'vitest';
import { PlaylistGateway } from '../src/providers/playlist-gateway.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { ProviderSelectionError } from '../src/providers/errors.js';

const fake = (id: string, provider: string, calls: string[] = [], batchSize = 2): any => ({
  summary: { connectionId: id, provider, capabilities: { playlistWrite: true } },
  playlistWrite: {
    createPlaylist: async (input: any) => ({ id: `${id}-playlist`, ...input }),
    addTracks: async (playlistId: string, tracks: string[]) => {
      for (let i = 0; i < tracks.length; i += batchSize)
        calls.push(`${id}:${playlistId}:${tracks.slice(i, i + batchSize).join(',')}`);
      return { ok: true };
    },
    removeTracks: async () => ({ ok: true }),
    reorderTracks: async (_id: string, input: unknown) => input,
    replaceTracks: async (_id: string, tracks: string[]) => ({ ok: true, tracks }),
    updatePlaylist: async (_id: string, input: unknown) => input,
  },
});

describe('PlaylistGateway', () => {
  it('fails closed when the write target is ambiguous', async () => {
    const registry = new ProviderRegistry();
    registry.register(fake('a', 'alpha'));
    registry.register(fake('b', 'beta'));
    expect(() => new PlaylistGateway(registry).create({ name: 'x' })).toThrow(
      ProviderSelectionError,
    );
  });

  it('uses the explicit connection and never assumes Spotify paths or batches', async () => {
    const calls: string[] = [];
    const registry = new ProviderRegistry();
    registry.register(fake('a', 'alpha', calls, 2));
    registry.register(fake('b', 'beta', calls, 3));
    const gateway = new PlaylistGateway(registry);
    await gateway.add('remote-playlist', ['one', 'two', 'three', 'four'], { connection_id: 'b' });
    expect(calls).toEqual(['b:remote-playlist:one,two,three', 'b:remote-playlist:four']);
  });

  it('allows an explicit provider only when one write connection matches', async () => {
    const registry = new ProviderRegistry();
    registry.register(fake('a', 'alpha'));
    const result = await new PlaylistGateway(registry).create({ name: 'x' }, { provider: 'alpha' });
    expect(result).toMatchObject({ id: 'a-playlist', name: 'x' });
  });
});
