CREATE TABLE listening_events (
  id TEXT PRIMARY KEY,
  spotify_track_id TEXT NOT NULL,
  track_uri TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  occurred_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  session_id TEXT,
  progress_ms INTEGER,
  duration_ms INTEGER,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE(spotify_track_id, occurred_at, source, event_type)
);
CREATE INDEX idx_listening_events_time ON listening_events(occurred_at DESC);
CREATE INDEX idx_listening_events_track ON listening_events(spotify_track_id, occurred_at DESC);
CREATE INDEX idx_listening_events_artist ON listening_events(artist, occurred_at DESC);
CREATE TABLE rotation_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  target_playlist_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily','weekly','manual')),
  enabled INTEGER NOT NULL DEFAULT 1,
  last_planned_at INTEGER,
  last_completed_at INTEGER,
  next_due_at INTEGER,
  last_operation_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_rotation_due ON rotation_definitions(enabled, next_due_at);
