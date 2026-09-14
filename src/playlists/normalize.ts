import { normalizeText, normalizeTitle } from '../music/normalize.js';
import type { NormalizedPlaylistTrack } from './types.js';

const marker = (title: string, re: RegExp) => re.test(title);
export function normalizePlaylistTrack(
  item: any,
  position: number,
): NormalizedPlaylistTrack | null {
  const x = item?.item ?? item;
  const metadata = x?.metadata ?? {};
  if (!x || (x.type && x.type !== 'track') || (!x.uri && !metadata.providerUri)) return null;
  const title = String(x.name ?? ''),
    artists = Array.isArray(x.artists) ? x.artists : [],
    album = x.album ?? {};
  const n = normalizeTitle(title);
  return {
    id: x.id ?? null,
    uri: x.uri ?? metadata.providerUri ?? null,
    canonicalTrackId: x.canonicalTrackId ?? metadata.canonicalTrackId ?? null,
    providerId: x.providerId ?? metadata.providerId ?? null,
    connectionId: x.connectionId ?? metadata.connectionId ?? null,
    title,
    normalizedTitle: n,
    artistIds: artists.map((a: any) => a.id).filter(Boolean),
    artistNames: artists.map((a: any) => String(a.name ?? '')),
    primaryArtist: String(artists[0]?.name ?? ''),
    normalizedArtist: normalizeText(String(artists[0]?.name ?? '')),
    albumId: album.id ?? null,
    albumName: String(album.name ?? ''),
    normalizedAlbum: normalizeText(String(album.name ?? '')),
    durationMs: Number.isFinite(x.duration_ms)
      ? x.duration_ms
      : Number.isFinite(metadata.durationMs)
        ? metadata.durationMs
        : null,
    explicit: Boolean(x.explicit),
    isrc: x.external_ids?.isrc ?? null,
    position,
    originalIndex: position,
    version: {
      remaster: marker(title, /remaster/i),
      live: marker(title, /\blive\b/i),
      remix: marker(title, /\bremix/i),
      radioEdit: marker(title, /radio\s*edit/i),
      acoustic: marker(title, /acoustic/i),
      instrumental: marker(title, /instrumental/i),
      spedUp: marker(title, /sped\s*up/i),
      slowed: marker(title, /slowed/i),
    },
  };
}
export function normalizePlaylistItems(items: any[]): {
  tracks: NormalizedPlaylistTrack[];
  unavailable: number;
} {
  const tracks: NormalizedPlaylistTrack[] = [];
  let unavailable = 0;
  items.forEach((item, i) => {
    const t = normalizePlaylistTrack(item, i);
    if (t) tracks.push(t);
    else unavailable++;
  });
  return { tracks, unavailable };
}
export const fingerprint = (uris: Array<string | null>) => uris.map((x) => x ?? 'null').join('\n');
