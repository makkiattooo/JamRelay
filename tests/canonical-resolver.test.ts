import { describe, expect, it, vi } from 'vitest';
import {
  CanonicalTrackResolver,
  type CanonicalTrackQuery,
} from '../src/music/canonical-resolver.js';
import type { MusicCandidate } from '../src/music/normalize.js';

const candidate = (
  id: string,
  name = 'Song',
  metadata: Record<string, unknown> = {},
): MusicCandidate => ({
  id,
  name,
  artists: [{ name: 'Artist' }],
  album: { name: 'Album', release_date: '2020-01-01' },
  metadata,
});
const query: CanonicalTrackQuery = { title: 'Song', artist: 'Artist', album: 'Album', year: 2020 };

describe('CanonicalTrackResolver', () => {
  it('uses a verified cache hit without calling a provider catalog', async () => {
    const search = vi.fn(async () => [candidate('unused')]);
    const result = await new CanonicalTrackResolver({
      provider: 'alpha',
      connectionId: 'alpha-main',
      searchTracks: search,
      findCached: () => ({
        status: 'matched',
        source: 'database',
        canonicalId: 7,
        providerTrackId: 'a-7',
        providerUrl: 'https://alpha/7',
      }),
    }).resolve({ title: 'Song', artist: 'Artist', album: 'Album' });
    expect(result).toMatchObject({
      status: 'matched',
      source: 'database',
      canonicalId: 7,
      provider: 'alpha',
    });
    expect(search).not.toHaveBeenCalled();
  });

  it('keeps same-title recordings ambiguous without stronger evidence', async () => {
    const result = await new CanonicalTrackResolver({
      provider: 'alpha',
      connectionId: 'a',
      searchTracks: async () => [candidate('one'), candidate('two')],
    }).resolve({ title: 'Song', artist: 'Artist', album: 'Album' });
    expect(result.status).toBe('ambiguous');
  });

  it('uses ISRC and duration evidence to select the exact recording', async () => {
    const result = await new CanonicalTrackResolver({
      provider: 'alpha',
      connectionId: 'a',
      searchTracks: async () => [
        candidate('wrong', 'Song', { isrc: 'other', durationMs: 100000 }),
        candidate('right', 'Song', { isrc: 'US-EXACT-1', durationMs: 210000 }),
      ],
    }).resolve({ ...query, isrc: 'US-EXACT-1', durationMs: 210500 });
    expect(result).toMatchObject({ status: 'matched', providerTrackId: 'right' });
  });

  it('verifies external IDs through the provider before accepting evidence', async () => {
    const getTrack = vi.fn(async (id: string) => (id === 'verified' ? candidate(id) : null));
    const result = await new CanonicalTrackResolver({
      provider: 'beta',
      connectionId: 'b',
      searchTracks: async () => [],
      getTrack,
    }).resolveExternal(query, ['verified', 'unknown']);
    expect(getTrack).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: 'matched',
      source: 'external_verified',
      providerTrackId: 'verified',
    });
  });

  it('returns waiting when the selected provider is rate limited', async () => {
    const result = await new CanonicalTrackResolver({
      provider: 'alpha',
      connectionId: 'a',
      searchTracks: async () => [],
      isRateLimited: () => true,
    }).resolve(query);
    expect(result).toMatchObject({ status: 'waiting', waitingReason: 'rate_limited' });
  });
});
