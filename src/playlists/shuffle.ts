import type { NormalizedPlaylistTrack } from './types.js';
const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
export function seededShuffle(
  tracks: NormalizedPlaylistTrack[],
  options: {
    seed?: number;
    minArtistGap?: number;
    minAlbumGap?: number;
    preserveFirstN?: number;
    preserveLastN?: number;
  } = {},
) {
  const random = rng(options.seed ?? 1),
    first = tracks.slice(0, options.preserveFirstN ?? 0),
    last = options.preserveLastN ? tracks.slice(-options.preserveLastN) : [],
    pool = tracks.slice(first.length, tracks.length - last.length);
  const result = [...first];
  const gap = options.minArtistGap ?? 1,
    albumGap = options.minAlbumGap ?? 0;
  while (pool.length) {
    const eligible = pool.filter(
      (t) =>
        result.slice(-gap).every((x) => x.normalizedArtist !== t.normalizedArtist) &&
        result.slice(-(albumGap || 0)).every((x) => x.normalizedAlbum !== t.normalizedAlbum),
    );
    const choices = eligible.length ? eligible : pool;
    const index = Math.floor(random() * choices.length);
    const chosen = choices[index];
    result.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  result.push(...last);
  return result;
}
export const violations = (tracks: NormalizedPlaylistTrack[], gap = 1, albumGap = 0) =>
  tracks
    .slice(1)
    .reduce(
      (n, t, i) =>
        n +
        (tracks
          .slice(Math.max(0, i - gap), i)
          .some((x) => x.normalizedArtist === t.normalizedArtist)
          ? 1
          : 0) +
        (albumGap &&
        tracks
          .slice(Math.max(0, i - albumGap), i)
          .some((x) => x.normalizedAlbum === t.normalizedAlbum)
          ? 1
          : 0),
      0,
    );
