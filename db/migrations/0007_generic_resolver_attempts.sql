-- Make resolver attempts provider-neutral while preserving all legacy rows.
ALTER TABLE resolver_attempts RENAME TO resolver_attempts_legacy;
CREATE TABLE resolver_attempts (
  id INTEGER PRIMARY KEY,
  query_title TEXT NOT NULL,
  query_artist TEXT,
  query_album TEXT,
  strategy TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('matched','ambiguous','unmatched','failed')),
  track_id INTEGER,
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0)),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_id INTEGER,
  provider_id TEXT NOT NULL DEFAULT 'spotify',
  connection_id TEXT NOT NULL DEFAULT 'spotify-default',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE SET NULL,
  FOREIGN KEY (error_id) REFERENCES api_errors(id) ON DELETE SET NULL
);
INSERT INTO resolver_attempts
  (id,query_title,query_artist,query_album,strategy,status,track_id,confidence,duration_ms,error_id,created_at)
SELECT id,query_title,query_artist,query_album,strategy,status,track_id,confidence,duration_ms,error_id,created_at
FROM resolver_attempts_legacy;
DROP INDEX idx_resolver_attempts_created;
DROP INDEX idx_resolver_attempts_status;
DROP INDEX idx_resolver_attempts_track;
DROP INDEX idx_resolver_attempts_error;
DROP TABLE resolver_attempts_legacy;
CREATE INDEX idx_resolver_attempts_created ON resolver_attempts(created_at DESC);
CREATE INDEX idx_resolver_attempts_status ON resolver_attempts(status);
CREATE INDEX idx_resolver_attempts_track ON resolver_attempts(track_id);
CREATE INDEX idx_resolver_attempts_error ON resolver_attempts(error_id);
CREATE INDEX idx_resolver_attempts_provider ON resolver_attempts(provider_id, connection_id, created_at DESC);
