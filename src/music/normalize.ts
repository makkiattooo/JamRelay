export type MusicArtist = {
  id?: string;
  name: string;
};

export type MusicAlbum = {
  id?: string;
  name: string;
  release_date?: string;
};

/** Provider-neutral candidate shape used by catalog matching. */
export type MusicCandidate = {
  id: string;
  name: string;
  artists: MusicArtist[];
  album?: MusicAlbum;
  metadata?: Record<string, unknown>;
};

export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\s*\((?:feat\.?|ft\.?|featuring)\s+[^)]*\)/g, '')
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeTitle(value: string): string {
  return normalizeText(value)
    .replace(
      /\b(?:\d{4}\s*)?(?:deluxe|expanded|anniversary|remaster(?:ed)?|radio\s*edit|live|acoustic|instrumental|sped\s*up|slowed|remix)\b/g,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export function scoreTrack<T extends MusicCandidate>(
  candidate: T,
  title: string,
  artist: string,
  album?: string,
  year?: number,
  evidence: { isrc?: string; durationMs?: number } = {},
) {
  const t = normalizeText(candidate.name),
    q = normalizeText(title),
    artists = candidate.artists.map((a) => normalizeText(a.name));
  let score = t === q ? 0.55 : t.includes(q) || q.includes(t) ? 0.3 : 0;
  const ar = normalizeText(artist);
  if (artists.some((a) => a === ar || a.includes(ar) || ar.includes(a))) score += 0.35;
  if (album && candidate.album && normalizeText(candidate.album.name) === normalizeText(album))
    score += 0.08;
  if (
    year &&
    typeof candidate.album?.release_date === 'string' &&
    candidate.album.release_date.startsWith(String(year))
  )
    score += 0.02;
  if (evidence.isrc && candidate.metadata?.isrc === evidence.isrc) score += 0.2;
  if (evidence.durationMs != null && typeof candidate.metadata?.durationMs === 'number') {
    const delta = Math.abs(candidate.metadata.durationMs - evidence.durationMs);
    if (delta <= 2000) score += 0.05;
    else if (delta > 10000) score -= 0.1;
  }
  return Math.min(1, score);
}

export function resolveCandidates<T extends MusicCandidate>(
  items: T[],
  title: string,
  artist: string,
  album?: string,
  year?: number,
  evidence: { isrc?: string; durationMs?: number } = {},
) {
  const scored = items
    .map((item) => ({
      ...item,
      score: scoreTrack(item, title, artist, album, year, evidence),
      year_match: year != null && item.album?.release_date?.startsWith(String(year)) ? 1 : 0,
    }))
    .sort((a, b) => b.score - a.score || b.year_match - a.year_match);
  const best = scored[0],
    second = scored[1];
  const yearBreaksTie = year != null && best?.year_match === 1;
  return !best || best.score < 0.75
    ? { status: 'unmatched' as const, candidates: scored }
    : {
        status:
          second &&
          best.score - second.score < 0.1 &&
          !yearBreaksTie &&
          best.year_match === second.year_match
            ? ('ambiguous' as const)
            : ('matched' as const),
        match: best,
        candidates: scored,
      };
}
