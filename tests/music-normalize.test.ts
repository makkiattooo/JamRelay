import { describe, expect, it } from 'vitest';
import { normalizeText, normalizeTitle, resolveCandidates } from '../src/music/normalize.js';

describe('provider-neutral music primitives', () => {
  it('normalizes text without provider-shaped identifiers or URLs', () => {
    expect(normalizeText('Beyoncé — Halo (feat. Jay-Z)')).toBe('beyonce halo');
    expect(normalizeTitle('Song (Deluxe Edition)')).toBe('song edition');
  });

  it('matches generic catalog candidates without URI assumptions', () => {
    const result = resolveCandidates(
      [
        {
          id: 'catalog-1',
          name: 'Halo',
          artists: [{ id: 'artist-1', name: 'Beyoncé' }],
          album: { id: 'album-1', name: 'I Am... Sasha Fierce' },
        },
      ],
      'Halo',
      'Beyonce',
    );

    expect(result.status).toBe('matched');
    expect(result.match?.id).toBe('catalog-1');
  });
});
