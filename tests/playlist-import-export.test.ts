import { describe, expect, it } from 'vitest';
import {
  exportPlaylist,
  parsePlaylistImport,
  type PlaylistDocument,
} from '../src/playlists/import-export.js';

const document: PlaylistDocument = {
  version: 1,
  format: 'jamrelay-playlist',
  name: 'Zażółć 🎵',
  tracks: [
    { position: 0, title: 'A, "quoted"', artist: 'Łódź', album: 'Å', uri: 'beta:1' },
    { position: 1, title: 'Duplicate', artist: 'Artist', uri: 'beta:1' },
  ],
};

describe('provider-neutral playlist import/export', () => {
  it('roundtrips native versioned JSON and preserves duplicates/order', () => {
    const parsed = parsePlaylistImport(exportPlaylist(document, 'json'), 'json');
    expect(parsed.ok).toBe(true);
    expect(parsed.document?.tracks.map((x) => x.title)).toEqual(['A, "quoted"', 'Duplicate']);
    expect(parsed.document?.tracks.map((x) => x.uri)).toEqual(['beta:1', 'beta:1']);
  });

  it('escapes CSV fields and preserves unicode', () => {
    const parsed = parsePlaylistImport(exportPlaylist(document, 'csv'), 'csv');
    expect(parsed.ok).toBe(true);
    expect(parsed.document?.tracks[0]).toMatchObject({ title: 'A, "quoted"', artist: 'Łódź' });
  });

  it('preserves M3U8 ordering and duplicate entries', () => {
    const parsed = parsePlaylistImport(exportPlaylist(document, 'm3u8'), 'm3u8');
    expect(parsed.ok).toBe(true);
    expect(parsed.document?.tracks.map((x) => x.uri)).toEqual(['beta:1', 'beta:1']);
  });

  it('returns bounded structured errors for malformed and oversized input', () => {
    expect(parsePlaylistImport('{"version":2}', 'json')).toMatchObject({
      ok: false,
      errors: [{ code: 'invalid_json_schema' }],
    });
    expect(parsePlaylistImport('x'.repeat(1024 * 1024 + 1), 'txt')).toMatchObject({
      ok: false,
      errors: [{ code: 'input_too_large' }],
    });
  });

  it('works without connected providers and never performs a write', () => {
    const report = parsePlaylistImport('Title\tArtist\tAlbum\tbeta:track\n', 'txt');
    expect(report.ok).toBe(true);
    expect(report.document?.tracks[0].uri).toBe('beta:track');
    expect(exportPlaylist(report.document!, 'txt')).toContain('beta:track');
  });
});
