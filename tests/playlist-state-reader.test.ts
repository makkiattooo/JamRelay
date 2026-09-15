import { describe, expect, it } from 'vitest';
import { PlaylistStateReader } from '../src/playlists/state-reader.js';

describe('PlaylistStateReader', () => {
  it('reads all offset pages in order', async () => {
    const calls: number[] = [];
    const gateway = {
      get: async () => ({ trackCount: 3 }),
      items: async (_id: string, options: any) => {
        calls.push(options.offset);
        return options.offset === 0
          ? { items: [{ id: 'a' }, { id: 'b' }], next: 'https://provider.test/items?offset=2' }
          : { items: [{ id: 'c' }] };
      },
    } as any;
    const result = await new PlaylistStateReader(gateway).read('playlist', {
      connection_id: 'conn',
      provider: 'fake',
    });
    expect(calls).toEqual([0, 2]);
    expect(result.items).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(result.totalCount).toBe(3);
  });

  it('traverses cursor pages sequentially', async () => {
    const tokens: unknown[] = [];
    const gateway = {
      get: async () => ({ trackCount: 2 }),
      items: async (_id: string, options: any) => {
        tokens.push(options.pageToken);
        return options.pageToken === undefined
          ? { items: [{ id: 'a' }], next: 'cursor-2' }
          : { items: [{ id: 'b' }] };
      },
    } as any;
    const result = await new PlaylistStateReader(gateway).read('playlist');
    expect(tokens).toEqual([undefined, 'cursor-2']);
    expect(result.items.map((x: any) => x.id)).toEqual(['a', 'b']);
  });

  it('reuses item pages when the provider revision is unchanged', async () => {
    let itemCalls = 0;
    const gateway = {
      get: async () => ({ trackCount: 1, providerRevision: 'rev-1' }),
      items: async () => {
        itemCalls++;
        return { items: [{ id: 'cached' }] };
      },
    } as any;
    const reader = new PlaylistStateReader(gateway);
    await reader.read('playlist', { provider: 'fake', connection_id: 'account-a' });
    const warm = await reader.read('playlist', { provider: 'fake', connection_id: 'account-a' });
    expect(itemCalls).toBe(1);
    expect(warm.cache).toBe('hit');
    expect(warm.items).toEqual([{ id: 'cached' }]);
  });

  it('bounds deterministic offset pagination and preserves order', async () => {
    const calls: number[] = [];
    let active = 0;
    let maximum = 0;
    const gateway = {
      get: async () => ({ trackCount: 250, providerRevision: 'large-1' }),
      items: async (_id: string, options: any) => {
        const offset = Number(options.offset ?? 0);
        calls.push(offset);
        active++;
        maximum = Math.max(maximum, active);
        const result = {
          items: Array.from({ length: Math.min(50, 250 - offset) }, (_, i) => ({ id: offset + i })),
        };
        active--;
        return offset === 0 ? { ...result, next: 'https://provider.test/items?offset=50' } : result;
      },
    } as any;
    const result = await new PlaylistStateReader(gateway).read('large-playlist', {
      provider: 'fake-large',
      connection_id: 'account-large',
    });
    expect(maximum).toBeLessThanOrEqual(8);
    expect(calls.sort((a, b) => a - b)).toEqual([0, 50, 100, 150, 200]);
    expect((result.items[0] as any).id).toBe(0);
    expect((result.items.at(-1) as any).id).toBe(249);
  });

  it('rejects an inconsistent revision observed during parallel pagination', async () => {
    let metadataReads = 0;
    const gateway = {
      get: async () => ({
        trackCount: 100,
        providerRevision: ++metadataReads === 1 ? 'rev-a' : 'rev-b',
      }),
      items: async (_id: string, options: any) =>
        options.offset === 0
          ? { items: [{ id: 0 }], next: 'https://provider.test/items?offset=50' }
          : { items: [{ id: options.offset }] },
    } as any;
    await expect(
      new PlaylistStateReader(gateway).read('revision-changing-playlist', {
        provider: 'revision-provider',
        connection_id: 'revision-account',
      }),
    ).rejects.toThrow('playlist_state_stale');
  });
});
