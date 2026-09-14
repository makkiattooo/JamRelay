-- Provider-aware snapshot item references. Legacy uri values remain intact.
ALTER TABLE playlist_snapshot_items ADD COLUMN provider_track_id TEXT;
ALTER TABLE playlist_snapshot_items ADD COLUMN provider_uri TEXT;
ALTER TABLE playlist_snapshot_items ADD COLUMN provider_url TEXT;

CREATE INDEX idx_playlist_snapshots_scope
  ON playlist_snapshots(provider_id, connection_id, playlist_id, created_at DESC);
CREATE INDEX idx_playlist_operations_scope
  ON playlist_operations(provider_id, connection_id, playlist_id, created_at DESC);
