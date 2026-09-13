import type { NormalizedPlaylistTrack } from './types.js';
export const durationMs = (tracks: NormalizedPlaylistTrack[]) =>
  tracks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
export function trimTracks(
  tracks: NormalizedPlaylistTrack[],
  target: number,
  strategy = 'from_end',
  seed = 1,
) {
  if (durationMs(tracks) <= target) return [...tracks];
  const out = [...tracks];
  if (strategy === 'deterministic_random') {
    let s = seed >>> 0;
    while (durationMs(out) > target && out.length) {
      s = (s * 1664525 + 1013904223) >>> 0;
      out.splice(s % out.length, 1);
    }
    return out;
  }
  while (durationMs(out) > target && out.length)
    out.splice(strategy === 'from_end' ? out.length - 1 : 0, 1);
  return out;
}
