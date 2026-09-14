import { normalizeText } from '../music/normalize.js';
import type { DuplicateGroup, NormalizedPlaylistTrack } from './types.js';

export function semanticDuplicateGroups(
  tracks: NormalizedPlaylistTrack[],
  options: {
    preferOriginal?: boolean;
    removeRemasters?: boolean;
    removeLive?: boolean;
    removeRemixes?: boolean;
    removeSpedUp?: boolean;
    removeSlowed?: boolean;
    durationToleranceMs?: number;
  } = {},
): DuplicateGroup[] {
  const groups = new Map<string, NormalizedPlaylistTrack[]>();
  for (const t of tracks) {
    const key = t.isrc ? `isrc:${t.isrc}` : `title:${t.normalizedArtist}\0${t.normalizedTitle}`;
    const xs = groups.get(key) ?? [];
    xs.push(t);
    groups.set(key, xs);
  }
  const out: DuplicateGroup[] = [];
  for (const [key, xs] of groups) {
    if (xs.length < 2) continue;
    const sorted = [...xs].sort(
      (a, b) =>
        (options.preferOriginal !== false
          ? Number(a.version.remaster) - Number(b.version.remaster)
          : 0) || a.position - b.position,
    );
    const kept = sorted[0],
      removable: NormalizedPlaylistTrack[] = [],
      evidence: string[] = [];
    for (const candidate of sorted.slice(1)) {
      const durationOk =
        kept.durationMs == null ||
        candidate.durationMs == null ||
        Math.abs(kept.durationMs - candidate.durationMs) <= (options.durationToleranceMs ?? 2500);
      const blocked =
        (candidate.version.live && !options.removeLive) ||
        (candidate.version.remix && !options.removeRemixes) ||
        (candidate.version.remaster && !options.removeRemasters) ||
        (candidate.version.spedUp && options.removeSpedUp === false) ||
        (candidate.version.slowed && options.removeSlowed === false);
      if (!durationOk || blocked) continue;
      removable.push(candidate);
      evidence.push(candidate.isrc ? 'same ISRC' : 'same normalized primary artist and title');
    }
    if (removable.length)
      out.push({
        key,
        kept,
        removable,
        confidence: kept.isrc ? 'exact' : 'high',
        reason: `Deterministic match by ${kept.isrc ? 'ISRC' : 'normalized artist/title'} with compatible duration.`,
        evidence: [...new Set(evidence)],
      });
  }
  return out;
}

export function healthReport(tracks: NormalizedPlaylistTrack[], unavailable = 0) {
  const count = tracks.length,
    artistCounts = new Map<string, number>(),
    albumCounts = new Map<string, number>();
  tracks.forEach((t) => {
    artistCounts.set(t.primaryArtist, (artistCounts.get(t.primaryArtist) ?? 0) + 1);
    albumCounts.set(t.albumName, (albumCounts.get(t.albumName) ?? 0) + 1);
  });
  const artists = [...artistCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const exact = count - new Set(tracks.map((t) => t.id ?? t.uri)).size;
  const durations = tracks.map((t) => t.durationMs).filter((x): x is number => x != null);
  const adjacent = tracks
    .slice(1)
    .filter((t, i) => t.normalizedArtist === tracks[i].normalizedArtist).length;
  return {
    totalTracks: count + unavailable,
    uniqueTracks: count - exact,
    exactDuplicateCount: exact,
    topArtists: artists
      .slice(0, 10)
      .map(([name, n]) => ({ name, count: n, share: count ? n / count : 0 })),
    largestArtistShare: count ? artists[0]?.[1] / count : 0,
    top5ArtistShare: count ? artists.slice(0, 5).reduce((s, x) => s + x[1], 0) / count : 0,
    albumConcentration: [...albumCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    explicitPercentage: count ? tracks.filter((t) => t.explicit).length / count : 0,
    durationMs: durations.reduce((a, b) => a + b, 0),
    shortestMs: durations.length ? Math.min(...durations) : null,
    longestMs: durations.length ? Math.max(...durations) : null,
    repeatedAdjacentArtists: adjacent,
    unavailableItems: unavailable,
    warnings: [
      unavailable ? `${unavailable} unavailable or non-track items were encountered.` : '',
      adjacent ? `${adjacent} adjacent artist repetitions detected.` : '',
    ].filter(Boolean),
  };
}
