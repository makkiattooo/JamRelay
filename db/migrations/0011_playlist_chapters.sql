CREATE TABLE IF NOT EXISTS playlist_chapter_sets (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  playlist_snapshot_id TEXT,
  content_fingerprint TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  style TEXT NOT NULL,
  options_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_playlist_chapter_sets_playlist
  ON playlist_chapter_sets(playlist_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS playlist_chapters (
  id TEXT PRIMARY KEY,
  chapter_set_id TEXT NOT NULL REFERENCES playlist_chapter_sets(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  start_index INTEGER NOT NULL,
  end_index INTEGER NOT NULL,
  start_track_id TEXT,
  end_track_id TEXT,
  duration_ms INTEGER NOT NULL,
  track_count INTEGER NOT NULL,
  metadata_json TEXT NOT NULL,
  UNIQUE(chapter_set_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS playlist_chapter_progress (
  playlist_id TEXT NOT NULL,
  chapter_set_id TEXT NOT NULL REFERENCES playlist_chapter_sets(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('not_started','in_progress','completed')),
  last_track_index INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(playlist_id, chapter_set_id, chapter_number)
);
