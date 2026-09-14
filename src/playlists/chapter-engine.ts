import { randomUUID } from 'node:crypto';
import type { SpotifyClient } from '../spotify/client.js';
import { getDatabase, isDatabaseInitialized } from '../db/database.js';
import { normalizePlaylistItems } from './normalize.js';
import type { NormalizedPlaylistTrack } from './types.js';
import { durationMs } from './duration.js';

export type ChapterStyle = 'narrative' | 'balanced' | 'energy' | 'album_like';
export type ChapterOptions = {
  targetChapterMinutes?: number;
  minChapterMinutes?: number;
  maxChapterMinutes?: number;
  minTracks?: number;
  maxTracks?: number;
  chapterCount?: number;
  preserveOrder?: boolean;
  style?: ChapterStyle;
  regenerateTitles?: boolean;
};
export type Chapter = {
  number: number;
  title: string;
  summary: string;
  start_index: number;
  end_index: number;
  track_count: number;
  duration_ms: number;
  metadata?: Record<string, unknown>;
};
export type ChapterSet = {
  id: string;
  playlist_id: string;
  playlist_snapshot_id?: string | null;
  content_fingerprint: string;
  style: ChapterStyle;
  stale: boolean;
  chapters: Chapter[];
  analysis: Record<string, unknown>;
};

const clean = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const titleWords = (track: NormalizedPlaylistTrack) =>
  clean(track.title).split(' ').filter(Boolean);
const fingerprint = (tracks: NormalizedPlaylistTrack[]) =>
  tracks.map((track) => track.uri ?? '').join('\n');
const titleHints: Array<[RegExp, string]> = [
  [/\b(depart|leav|journey|awak|begin|first)\b/i, 'Departure'],
  [/\b(unknown|beyond|explor|encounter|search)\b/i, 'Into the Unknown'],
  [/\b(machine|city|neon|motion|drive|pulse)\b/i, 'The Movement'],
  [/\b(dark|shadow|night|fear|descent|collapse)\b/i, 'Descent'],
  [/\b(death|fire|storm|climax|rise|battle)\b/i, 'The Climax'],
  [/\b(aftermath|ashes|alone|silence|sleep)\b/i, 'Aftermath'],
  [/\b(home|return|hope|light|dawn|ending|arrival)\b/i, 'Return'],
];

function boundaryScore(tracks: NormalizedPlaylistTrack[], index: number, style: ChapterStyle) {
  const left = tracks[index],
    right = tracks[index + 1];
  if (!left || !right) return 0;
  const window = 4;
  const before = tracks.slice(Math.max(0, index - window + 1), index + 1);
  const after = tracks.slice(index + 1, index + window + 1);
  const beforeArtists = new Set(before.map((track) => track.normalizedArtist));
  const afterArtists = new Set(after.map((track) => track.normalizedArtist));
  const beforeAlbums = new Set(before.map((track) => track.normalizedAlbum));
  const afterAlbums = new Set(after.map((track) => track.normalizedAlbum));
  const artistChange =
    beforeArtists.size && [...beforeArtists].every((artist) => !afterArtists.has(artist))
      ? 0.34
      : 0;
  const albumChange =
    beforeAlbums.size && [...beforeAlbums].every((album) => !afterAlbums.has(album)) ? 0.24 : 0;
  const titleChange = titleWords(left).some((word) => titleWords(right).includes(word))
    ? -0.08
    : 0.06;
  const durationContrast =
    Math.abs((left.durationMs ?? 0) - (right.durationMs ?? 0)) > 180000 ? 0.08 : 0;
  const localContinuity = before.some((track) =>
    after.some(
      (candidate) =>
        track.normalizedArtist === candidate.normalizedArtist ||
        track.normalizedAlbum === candidate.normalizedAlbum,
    ),
  )
    ? -0.12
    : 0.08;
  const styleWeight = style === 'balanced' ? 0.7 : style === 'album_like' ? 0.85 : 1;
  return Math.max(
    0,
    Math.min(
      1,
      (artistChange + albumChange + titleChange + durationContrast + localContinuity) *
        styleWeight +
        0.12,
    ),
  );
}

function titleFor(tracks: NormalizedPlaylistTrack[], start: number, end: number, number: number) {
  const text = tracks
    .slice(start, end + 1)
    .map((track) => track.title)
    .join(' ');
  for (const [pattern, title] of titleHints) if (pattern.test(text)) return title;
  const artists = new Set(
    tracks
      .slice(start, end + 1)
      .map((track) => track.normalizedArtist)
      .filter(Boolean),
  );
  if (artists.size === 1) return `${tracks[start]?.primaryArtist || 'A'} Movement`;
  return (
    ['Opening', 'Development', 'Crossing', 'Tension', 'Release', 'Return', 'Epilogue'][
      number - 1
    ] || `Part ${number}`
  );
}

function summaryFor(tracks: NormalizedPlaylistTrack[], start: number, end: number) {
  const first = tracks[start],
    last = tracks[end];
  const artistCount = new Set(
    tracks
      .slice(start, end + 1)
      .map((track) => track.normalizedArtist)
      .filter(Boolean),
  ).size;
  if ((last?.durationMs ?? 0) > 7 * 60_000)
    return 'A spacious passage that gives the playlist room to breathe.';
  if (artistCount <= 2) return 'A focused passage that develops a coherent musical idea.';
  if (start === 0)
    return 'An opening sequence that establishes the playlist’s world and direction.';
  return 'A distinct movement that carries the existing order into its next phase.';
}

export function analyzeChapters(tracks: NormalizedPlaylistTrack[], options: ChapterOptions = {}) {
  if (!tracks.length) return { chapters: [], boundaries: [], duration_ms: 0 };
  const style = options.style ?? 'narrative';
  const total = durationMs(tracks);
  const target = (options.targetChapterMinutes ?? 60) * 60_000;
  const minDuration = (options.minChapterMinutes ?? 0) * 60_000;
  const maxDuration = (options.maxChapterMinutes ?? Number.POSITIVE_INFINITY) * 60_000;
  const minimum = Math.max(1, options.minTracks ?? 2);
  const maximum = Math.max(minimum, options.maxTracks ?? tracks.length);
  const desired = Math.max(
    1,
    Math.min(
      Math.ceil(tracks.length / minimum),
      (options.chapterCount ?? Math.round(total / target)) || 1,
    ),
  );
  const dp: Array<Array<{ score: number; starts: number[] } | undefined>> = Array.from(
    { length: desired + 1 },
    () => Array(tracks.length + 1),
  );
  dp[0][0] = { score: 0, starts: [] };
  for (let count = 1; count <= desired; count++) {
    for (let end = minimum; end <= tracks.length; end++) {
      let best: { score: number; starts: number[] } | undefined;
      for (let start = Math.max(0, end - maximum); start <= end - minimum; start++) {
        const prior = dp[count - 1][start];
        if (!prior) continue;
        const segmentDuration = durationMs(tracks.slice(start, end));
        const durationPenalty =
          (Math.abs(segmentDuration - target) / Math.max(target, 1)) *
            (style === 'balanced' ? 1.1 : 0.35) +
          (segmentDuration < minDuration ? (minDuration - segmentDuration) / target : 0) +
          (segmentDuration > maxDuration ? (segmentDuration - maxDuration) / target : 0);
        const boundary = start === 0 ? 0 : boundaryScore(tracks, start - 1, style);
        const score = prior.score + boundary - durationPenalty;
        if (!best || score > best.score) best = { score, starts: [...prior.starts, start] };
      }
      dp[count][end] = best;
    }
  }
  const chosen =
    dp[desired][tracks.length] ?? dp.findLast((row) => row[tracks.length])?.[tracks.length]!;
  const starts = chosen?.starts ?? [0];
  const chapters: Chapter[] = starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] - 1 : tracks.length - 1;
    return {
      number: index + 1,
      title: titleFor(tracks, start, end, index + 1),
      summary: summaryFor(tracks, start, end),
      start_index: start,
      end_index: end,
      track_count: end - start + 1,
      duration_ms: durationMs(tracks.slice(start, end + 1)),
      metadata: { boundary_score: start ? boundaryScore(tracks, start - 1, style) : null },
    };
  });
  return {
    chapters,
    boundaries: chapters.slice(1).map((chapter) => ({
      after_index: chapter.start_index - 1,
      score: chapter.metadata?.boundary_score,
      reasons: ['windowed artist/album transition', 'duration-aware partition'],
    })),
    duration_ms: total,
  };
}

export class PlaylistChapterEngine {
  constructor(
    private readonly client: SpotifyClient,
    private readonly fetchPlaylist: (playlistId: string) => Promise<{ meta: any; raw: any[] }>,
  ) {}
  async chapterize(
    playlistId: string,
    options: ChapterOptions = {},
    save = true,
  ): Promise<ChapterSet & { timings_ms: Record<string, number>; boundary_candidates: number }> {
    const started = Date.now(),
      fetched = await this.fetchPlaylist(playlistId),
      tracks = normalizePlaylistItems(fetched.raw).tracks;
    const analyzed = analyzeChapters(tracks, options),
      now = Date.now();
    let id = `chap_${randomUUID()}`;
    if (save && !isDatabaseInitialized()) throw new Error('state_database_required');
    if (save) {
      const db = getDatabase();
      db.prepare(
        'INSERT INTO playlist_chapter_sets (id,playlist_id,playlist_snapshot_id,content_fingerprint,version,style,options_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      ).run(
        id,
        playlistId,
        fetched.meta?.snapshot_id ?? null,
        fingerprint(tracks),
        1,
        options.style ?? 'narrative',
        JSON.stringify(options),
        now,
        now,
      );
      const insert = db.prepare(
        'INSERT INTO playlist_chapters (id,chapter_set_id,chapter_number,title,summary,start_index,end_index,start_track_id,end_track_id,duration_ms,track_count,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      );
      for (const chapter of analyzed.chapters)
        insert.run(
          `chapter_${randomUUID()}`,
          id,
          chapter.number,
          chapter.title,
          chapter.summary,
          chapter.start_index,
          chapter.end_index,
          tracks[chapter.start_index]?.id ?? null,
          tracks[chapter.end_index]?.id ?? null,
          chapter.duration_ms,
          chapter.track_count,
          JSON.stringify(chapter.metadata ?? {}),
        );
    }
    const total = Date.now() - started;
    return {
      id,
      playlist_id: playlistId,
      playlist_snapshot_id: fetched.meta?.snapshot_id,
      content_fingerprint: fingerprint(tracks),
      style: options.style ?? 'narrative',
      stale: false,
      chapters: analyzed.chapters,
      analysis: {
        chapter_count: analyzed.chapters.length,
        average_duration_ms: analyzed.chapters.length
          ? Math.round(analyzed.duration_ms / analyzed.chapters.length)
          : 0,
        shortest_duration_ms: analyzed.chapters.length
          ? Math.min(...analyzed.chapters.map((chapter) => chapter.duration_ms))
          : 0,
        longest_duration_ms: analyzed.chapters.length
          ? Math.max(...analyzed.chapters.map((chapter) => chapter.duration_ms))
          : 0,
      },
      timings_ms: { fetch_playlist: now - started, analysis: total - (now - started), total },
      boundary_candidates: Math.max(0, tracks.length - 1),
    };
  }
  async get(playlistId?: string, chapterSetId?: string): Promise<ChapterSet | null> {
    if (!isDatabaseInitialized()) throw new Error('state_database_required');
    const db = getDatabase();
    let set: any;
    if (chapterSetId)
      set = db.prepare('SELECT * FROM playlist_chapter_sets WHERE id=?').get(chapterSetId);
    else if (playlistId)
      set = db
        .prepare(
          'SELECT * FROM playlist_chapter_sets WHERE playlist_id=? ORDER BY updated_at DESC LIMIT 1',
        )
        .get(playlistId);
    else return null;
    if (!set) return null;
    const rows = db
      .prepare('SELECT * FROM playlist_chapters WHERE chapter_set_id=? ORDER BY chapter_number')
      .all(set.id) as any[];
    const currentState = await this.fetchPlaylist(set.playlist_id);
    const currentFingerprint = fingerprint(normalizePlaylistItems(currentState.raw).tracks);
    return {
      id: set.id,
      playlist_id: set.playlist_id,
      playlist_snapshot_id: set.playlist_snapshot_id,
      content_fingerprint: set.content_fingerprint,
      style: set.style,
      stale: currentFingerprint !== set.content_fingerprint,
      chapters: rows.map((row) => ({
        number: row.chapter_number,
        title: row.title,
        summary: row.summary,
        start_index: row.start_index,
        end_index: row.end_index,
        track_count: row.track_count,
        duration_ms: row.duration_ms,
        metadata: JSON.parse(row.metadata_json),
      })),
      analysis: { chapter_count: rows.length },
    };
  }
  async play(playlistId: string, chapterSetId: string, chapterNumber: number, deviceId?: string) {
    const set = await this.get(undefined, chapterSetId),
      chapter = set?.chapters.find((item) => item.number === chapterNumber);
    if (!set || set.playlist_id !== playlistId || !chapter) throw new Error('chapter_not_found');
    await this.client.json(
      '/me/player/play' + (deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ''),
      { context_uri: `spotify:playlist:${playlistId}`, offset: { position: chapter.start_index } },
      'PUT',
    );
    getDatabase()
      .prepare(
        'INSERT INTO playlist_chapter_progress (playlist_id,chapter_set_id,chapter_number,status,last_track_index,started_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(playlist_id,chapter_set_id,chapter_number) DO UPDATE SET status=excluded.status,last_track_index=excluded.last_track_index,started_at=excluded.started_at,updated_at=excluded.updated_at',
      )
      .run(
        playlistId,
        chapterSetId,
        chapterNumber,
        'in_progress',
        chapter.start_index,
        Date.now(),
        Date.now(),
      );
    return {
      ok: true,
      playlist_id: playlistId,
      chapter_set_id: chapterSetId,
      chapter_number: chapterNumber,
      starts_at_index: chapter.start_index,
      ends_at_index: chapter.end_index,
      note: 'Spotify may continue to the next playlist item after this chapter.',
    };
  }
}
