import { describe, expect, it } from 'vitest';
import { writePlaylistOrder } from '../src/spotify/write-operation.js';
import { TrackResolver } from '../src/spotify/resolver.js';

describe('playlist performance primitives', () => {
  it('writes a 120-track order in replace plus append chunks', async () => {
    const calls: Array<{ method: string; count: number }> = [];
    const result = await writePlaylistOrder({
      playlistId: 'p1',
      orderedTrackUris: Array.from({ length: 120 }, (_, i) => `spotify:track:${i}`),
      replace: async (uris) => {
        calls.push({ method: 'replace', count: uris.length });
        return null;
      },
      append: async (uris) => {
        calls.push({ method: 'append', count: uris.length });
        return null;
      },
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      { method: 'replace', count: 100 },
      { method: 'append', count: 20 },
    ]);
  });

  it('attempts rollback when a later order chunk fails', async () => {
    let rollback = 0;
    const result = await writePlaylistOrder({
      playlistId: 'p1',
      orderedTrackUris: Array.from({ length: 120 }, (_, i) => `spotify:track:${i}`),
      replace: async () => null,
      append: async () => {
        throw new Error('upstream failure');
      },
      rollback: async () => {
        rollback++;
      },
    });
    expect(result).toMatchObject({
      ok: false,
      partial: true,
      rollback_attempted: true,
      rollback_succeeded: true,
    });
    expect(rollback).toBe(1);
  });

  it('resolves catalog misses with bounded concurrency and exposes metrics', async () => {
    let active = 0;
    let maximum = 0;
    const resolver = new TrackResolver({
      request: async () => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return {
          tracks: {
            items: [
              {
                id: 't1',
                uri: 'spotify:track:t1',
                name: 'Track',
                artists: [{ name: 'Artist' }],
                album: { name: 'Album' },
                duration_ms: 1000,
              },
            ],
          },
        };
      },
    } as any);
    const results = await resolver.resolveMany(
      Array.from({ length: 10 }, (_, i) => ({ title: `Track ${i}`, artist: 'Artist' })),
      { concurrency: 3 },
    );
    expect(results).toHaveLength(10);
    expect(maximum).toBeLessThanOrEqual(3);
    expect(resolver.getLastBatchMetrics()).toMatchObject({ total: 10, searches: 10 });
  });
});
