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
export type TrackCandidate = {
  id: string;
  uri: string;
  name: string;
  artists: { id?: string; name: string }[];
  album?: { id?: string; name: string; release_date?: string };
  external_url?: string;
  [key: string]: unknown;
};
export function scoreTrack(
  candidate: TrackCandidate,
  title: string,
  artist: string,
  album?: string,
  year?: number,
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
  return Math.min(1, score);
}
export function resolveCandidates(
  items: TrackCandidate[],
  title: string,
  artist: string,
  album?: string,
  year?: number,
) {
  const scored = items
    .map((item) => ({
      ...item,
      score: scoreTrack(item, title, artist, album, year),
      year_match: year != null && item.album?.release_date?.startsWith(String(year)) ? 1 : 0,
    }))
    .sort((a, b) => b.score - a.score || b.year_match - a.year_match);
  const best = scored[0],
    second = scored[1];
  const yearBreaksTie = year != null && best?.year_match === 1;
  return !best || best.score < 0.75
    ? { status: 'unmatched', candidates: scored }
    : {
        status:
          second &&
          best.score - second.score < 0.1 &&
          !yearBreaksTie &&
          best.year_match === second.year_match
            ? 'ambiguous'
            : 'matched',
        match: best,
        candidates: scored,
      };
}
