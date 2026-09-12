import { describe, it, expect } from 'vitest';
import { normalizeText, resolveCandidates } from '../src/spotify/normalize.js';
import { paginate } from '../src/spotify/pagination.js';
import { chunks } from '../src/utils/chunks.js';
import { normalizeSpotifyError, SpotifyApiError } from '../src/spotify/errors.js';
describe('matching and pagination', () => {
  it('normalizes unicode punctuation and ignores feature suffix for title matching', () =>
    expect(normalizeText('Beyoncé — Halo (feat. Jay-Z)')).toBe('beyonce halo'));
  it('normalizes all supported feature suffix forms to the base title', () => {
    for (const value of [
      'Song feat. Artist',
      'Song ft. Artist',
      'Song featuring Artist',
      'Song (feat. Artist)',
      'Song (ft. Artist)',
    ])
      expect(normalizeText(value)).toBe('song');
  });
  it('matches exact track above threshold', () => {
    const r = resolveCandidates(
      [
        {
          id: '1',
          uri: 'spotify:track:1',
          name: 'Halo',
          artists: [{ name: 'Beyoncé' }],
          album: { name: 'I Am... Sasha Fierce' },
        },
      ],
      'Halo',
      'Beyonce',
    );
    expect(r.status).toBe('matched');
  });
  it('returns unmatched and ambiguous results', () => {
    expect(resolveCandidates([], 'x', 'y').status).toBe('unmatched');
    const a = [1, 2].map((id) => ({
      id: String(id),
      uri: 'spotify:track:' + id,
      name: 'Song',
      artists: [{ name: 'Artist' }],
    }));
    expect(resolveCandidates(a, 'Song', 'Artist').status).toBe('ambiguous');
  });
  it('uses the requested year as a deterministic tie breaker', () => {
    const r = resolveCandidates(
      [
        {
          id: '2020',
          uri: 'spotify:track:2020',
          name: 'Song',
          artists: [{ name: 'Artist' }],
          album: { name: 'Album', release_date: '2020-01-01' },
        },
        {
          id: '2024',
          uri: 'spotify:track:2024',
          name: 'Song',
          artists: [{ name: 'Artist' }],
          album: { name: 'Album', release_date: '2024-01-01' },
        },
      ],
      'Song',
      'Artist',
      'Album',
      2024,
    );
    expect(r.status).toBe('matched');
    expect(r.match?.id).toBe('2024');
  });
  for (const n of [99, 100, 101, 200, 201])
    it('chunks ' + n, () =>
      expect(chunks(Array.from({ length: n }), 100).length).toBe(Math.ceil(n / 100)),
    );
  it('paginates to requested count and stops', async () => {
    const calls: number[] = [];
    const x = await paginate(async (offset) => {
      calls.push(offset);
      return {
        items: Array.from({ length: 10 }, (_, i) => offset + i),
        next: offset < 20 ? 'https://x.test/?offset=' + (offset + 10) : null,
      };
    }, 25);
    expect(x).toHaveLength(25);
    expect(calls).toEqual([0, 10, 20]);
  });
  it('protects against repeated pagination', async () => {
    let calls = 0;
    const x = await paginate(async () => {
      calls++;
      return { items: [1], next: 'https://x.test/?offset=0' };
    }, 100);
    expect(x).toEqual([1]);
    expect(calls).toBe(1);
  });
  it('normalizes Spotify API errors', () => {
    const e = normalizeSpotifyError(429, { error: { message: 'slow' } }, 3);
    expect(e).toBeInstanceOf(SpotifyApiError);
    expect(e.code).toBe('rate_limited');
    expect(e.retryAfter).toBe(3);
  });
  it('keeps library writes at current 40 item chunks', () =>
    expect(chunks(Array.from({ length: 81 }), 40).map((x) => x.length)).toEqual([40, 40, 1]));
});
