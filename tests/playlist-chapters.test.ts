import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';
import { analyzeChapters, PlaylistChapterEngine } from '../src/playlists/chapter-engine.js';
import { normalizePlaylistItems } from '../src/playlists/normalize.js';

const rawTracks = (count = 42) =>
  Array.from({ length: count }, (_, index) => {
    const section = Math.floor(index / 7);
    return {
      type: 'track',
      id: `track-${index}`,
      uri: `spotify:track:${index}`,
      name:
        index % 7 === 0 ? ['Departure', 'Crossing', 'Night Drive'][section % 3] : `Song ${index}`,
      artists: [{ id: `artist-${section}`, name: `Artist ${section}` }],
      album: { id: `album-${section}`, name: `Album ${section}` },
      duration_ms: 210_000 + (index % 4) * 30_000,
    };
  });

let roots: string[] = [];
afterEach(async () => {
  closeDatabase();
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

describe('playlist chapter engine', () => {
  it('creates deterministic contiguous chapters without changing playlist order', () => {
    const tracks = normalizePlaylistItems(rawTracks()).tracks;
    const options = { chapterCount: 7, minTracks: 4, maxTracks: 10, style: 'narrative' as const };
    const first = analyzeChapters(tracks, options);
    const second = analyzeChapters(tracks, options);
    expect(first).toEqual(second);
    expect(first.chapters).toHaveLength(7);
    expect(first.chapters[0].start_index).toBe(0);
    expect(first.chapters.at(-1)?.end_index).toBe(tracks.length - 1);
    expect(
      first.chapters.flatMap((chapter) =>
        Array.from({ length: chapter.track_count }, (_, i) => chapter.start_index + i),
      ),
    ).toEqual(tracks.map((_, index) => index));
    expect(first.boundaries).toHaveLength(6);
  });

  it('persists a chapter set and reports stale content after playlist change', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jamrelay-chapters-'));
    roots.push(root);
    initializeDatabase({ dataDir: root, migrationsDir: join(process.cwd(), 'db/migrations') });
    let current = rawTracks();
    const client = { json: async () => ({}) } as any;
    const engine = new PlaylistChapterEngine(client, async () => ({
      meta: { snapshot_id: 'snapshot-1' },
      raw: current,
    }));
    const saved = await engine.chapterize('playlist-1', { chapterCount: 6 }, true);
    expect(getDatabase().prepare('SELECT COUNT(*) AS count FROM playlist_chapters').get()).toEqual({
      count: 6,
    });
    expect((await engine.get('playlist-1'))?.stale).toBe(false);
    current = [...current, { ...rawTracks(1)[0], id: 'new-track', uri: 'spotify:track:new' }];
    expect((await engine.get('playlist-1'))?.stale).toBe(true);
    expect((await engine.get('playlist-1'))?.content_fingerprint).toBe(saved.content_fingerprint);
  });

  it('starts playback at the chapter offset and records resumable progress', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jamrelay-chapters-'));
    roots.push(root);
    initializeDatabase({ dataDir: root, migrationsDir: join(process.cwd(), 'db/migrations') });
    const calls: unknown[] = [];
    const current = rawTracks();
    const engine = new PlaylistChapterEngine(
      { json: async (...args: unknown[]) => (calls.push(args), {}) } as any,
      async () => ({ meta: { snapshot_id: 'snapshot-1' }, raw: current }),
    );
    const set = await engine.chapterize('playlist-1', { chapterCount: 6 }, true);
    const chapter = set.chapters[2];
    const result = await engine.play('playlist-1', set.id, chapter.number, 'device-1');
    expect(result.starts_at_index).toBe(chapter.start_index);
    expect(calls[0]).toEqual([
      `/me/player/play?device_id=device-1`,
      { context_uri: 'spotify:playlist:playlist-1', offset: { position: chapter.start_index } },
      'PUT',
    ]);
    expect(
      getDatabase().prepare('SELECT status,last_track_index FROM playlist_chapter_progress').get(),
    ).toEqual({
      status: 'in_progress',
      last_track_index: chapter.start_index,
    });
  });
});
