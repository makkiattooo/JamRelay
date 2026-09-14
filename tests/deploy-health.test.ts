import { describe, expect, it } from 'vitest';
import { isOperationalHealthPayload } from '../scripts/deploy.mjs';

const health = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    status: 'ok',
    spotifyConnected: false,
    providers: [],
    database: { status: 'ok', schemaVersion: '0011_playlist_chapters.sql' },
    ...overrides,
  });

describe('deployment health gate', () => {
  it.each([false, true])('accepts a healthy instance with spotifyConnected=%s', (connected) => {
    expect(
      isOperationalHealthPayload(
        health({ spotifyConnected: connected }),
        '0011_playlist_chapters.sql',
      ),
    ).toBe(true);
  });

  it('accepts zero providers', () => {
    expect(
      isOperationalHealthPayload(health({ providers: [] }), '0011_playlist_chapters.sql'),
    ).toBe(true);
  });

  it('rejects an application error or wrong schema', () => {
    expect(
      isOperationalHealthPayload(health({ status: 'error' }), '0011_playlist_chapters.sql'),
    ).toBe(false);
    expect(isOperationalHealthPayload(health(), '0010_canonical_listening_history.sql')).toBe(
      false,
    );
  });

  it('rejects an unready database, malformed response, or unavailable endpoint', () => {
    expect(
      isOperationalHealthPayload(
        health({ database: { status: 'error', schemaVersion: '0011_playlist_chapters.sql' } }),
        '0011_playlist_chapters.sql',
      ),
    ).toBe(false);
    expect(isOperationalHealthPayload('{not-json', '0011_playlist_chapters.sql')).toBe(false);
    expect(isOperationalHealthPayload(undefined, '0011_playlist_chapters.sql')).toBe(false);
  });
});
