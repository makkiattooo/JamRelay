import { describe, it, expect } from 'vitest';
import { chunks } from '../src/utils/chunks.js';
import { parseSpotifyIdentifier } from '../src/spotify/identifiers.js';
import { TokenStore } from '../src/spotify/token-store.js';
import { SpotifyAuth } from '../src/spotify/auth.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
describe('core utilities', () => {
  it('chunks writes at 100', () => {
    const x = Array.from({ length: 201 }, (_, i) => i);
    expect(chunks(x, 100).map((a) => a.length)).toEqual([100, 100, 1]);
  });
  it('parses id uri and url and rejects wrong entity', () => {
    expect(parseSpotifyIdentifier('4uLU6hMCjMI75M1A2tKUQC', 'track').uri).toBe(
      'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
    );
    expect(parseSpotifyIdentifier('spotify:playlist:abc', 'playlist').id).toBe('abc');
    expect(() => parseSpotifyIdentifier('spotify:album:abc', 'playlist')).toThrow();
  });
  it('encrypts and decrypts token store', async () => {
    const file = join(tmpdir(), 'spotify-token-test-' + randomBytes(5).toString('hex') + '.json');
    const store = new TokenStore(file, randomBytes(32).toString('base64'));
    const token = { accessToken: 'access', refreshToken: 'refresh', expiresAt: 123 };
    await store.save(token);
    expect(await store.load()).toEqual(token);
    await store.clear();
  });
  it('rejects invalid encryption key', () => {
    expect(() => new TokenStore('x', 'bad')).toThrow();
  });
  it('validates oauth state once', () => {
    const store = new TokenStore('x', randomBytes(32).toString('base64'));
    const auth = new SpotifyAuth(
      {
        SPOTIFY_CLIENT_ID: 'id',
        SPOTIFY_CLIENT_SECRET: 'secret',
        SPOTIFY_REDIRECT_URI: 'https://example.com/cb',
      },
      store,
    );
    const x = auth.loginUrl();
    expect(() => auth.verifyState(x.state)).not.toThrow();
    expect(() => auth.verifyState(x.state)).toThrow();
  });
});
