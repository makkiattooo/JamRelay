CREATE TABLE playlist_snapshots (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  spotify_snapshot_id TEXT,
  metadata_json TEXT NOT NULL,
  track_count INTEGER NOT NULL CHECK (track_count >= 0),
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_playlist_snapshots_playlist ON playlist_snapshots(playlist_id, created_at DESC);
CREATE TABLE playlist_snapshot_items (
  snapshot_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  uri TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, position),
  FOREIGN KEY (snapshot_id) REFERENCES playlist_snapshots(id) ON DELETE CASCADE
);
CREATE TABLE playlist_operations (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  before_snapshot_id TEXT NOT NULL,
  after_snapshot_id TEXT,
  plan_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (before_snapshot_id) REFERENCES playlist_snapshots(id),
  FOREIGN KEY (after_snapshot_id) REFERENCES playlist_snapshots(id)
);
CREATE INDEX idx_playlist_operations_latest ON playlist_operations(playlist_id, created_at DESC);
