-- JamRelay migration: provider_aware_state
-- Forward-only staged migration. Legacy Spotify columns remain readable.

CREATE TABLE provider_connections (
  connection_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  account_id TEXT,
  display_label TEXT,
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('unknown', 'connected', 'disconnected', 'error')),
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_provider_connections_provider_status
  ON provider_connections(provider_id, status);

CREATE TABLE track_provider_mappings (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL,
  provider_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider_track_id TEXT NOT NULL,
  provider_uri TEXT,
  provider_url TEXT,
  isrc TEXT,
  availability TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
  UNIQUE (connection_id, provider_track_id),
  UNIQUE (track_id, provider_id, connection_id, provider_track_id)
);
CREATE INDEX idx_track_provider_mappings_track ON track_provider_mappings(track_id);
CREATE INDEX idx_track_provider_mappings_provider ON track_provider_mappings(provider_id, connection_id);

ALTER TABLE playlist_snapshots ADD COLUMN provider_id TEXT;
ALTER TABLE playlist_snapshots ADD COLUMN connection_id TEXT;
ALTER TABLE playlist_snapshots ADD COLUMN provider_snapshot_id TEXT;
UPDATE playlist_snapshots
SET provider_id = 'spotify', connection_id = 'spotify-default', provider_snapshot_id = spotify_snapshot_id
WHERE provider_id IS NULL;

ALTER TABLE playlist_operations ADD COLUMN provider_id TEXT;
ALTER TABLE playlist_operations ADD COLUMN connection_id TEXT;
UPDATE playlist_operations
SET provider_id = 'spotify', connection_id = 'spotify-default'
WHERE provider_id IS NULL;

ALTER TABLE listening_events ADD COLUMN canonical_track_id INTEGER;
ALTER TABLE listening_events ADD COLUMN provider_id TEXT;
ALTER TABLE listening_events ADD COLUMN connection_id TEXT;
ALTER TABLE listening_events ADD COLUMN provider_track_id TEXT;
ALTER TABLE listening_events ADD COLUMN provider_uri TEXT;
UPDATE listening_events
SET provider_id = 'spotify', connection_id = 'spotify-default', provider_track_id = spotify_track_id,
    provider_uri = track_uri;

ALTER TABLE rotation_definitions ADD COLUMN target_provider_id TEXT;
ALTER TABLE rotation_definitions ADD COLUMN target_connection_id TEXT;
UPDATE rotation_definitions
SET target_provider_id = 'spotify', target_connection_id = 'spotify-default'
WHERE target_provider_id IS NULL;

INSERT INTO provider_connections
  (connection_id, provider_id, display_label, status, capabilities_json, created_at, updated_at)
SELECT 'spotify-default', 'spotify', 'Legacy Spotify connection', 'unknown', '{}',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM provider_connections WHERE connection_id = 'spotify-default');

INSERT INTO track_provider_mappings
  (track_id, provider_id, connection_id, provider_track_id, provider_uri, verified_at, created_at, updated_at)
SELECT t.id, 'spotify', 'spotify-default', t.spotify_track_id, t.spotify_uri, t.verified_at, t.created_at, t.updated_at
FROM tracks t
WHERE NOT EXISTS (
  SELECT 1 FROM track_provider_mappings m
  WHERE m.connection_id = 'spotify-default' AND m.provider_track_id = t.spotify_track_id
);

UPDATE listening_events
SET canonical_track_id = (
  SELECT m.track_id
  FROM track_provider_mappings m
  WHERE m.connection_id = 'spotify-default' AND m.provider_track_id = listening_events.spotify_track_id
  LIMIT 1
)
WHERE canonical_track_id IS NULL;

CREATE INDEX idx_listening_events_canonical_track ON listening_events(canonical_track_id, occurred_at DESC);
CREATE INDEX idx_listening_events_provider ON listening_events(provider_id, connection_id, occurred_at DESC);
