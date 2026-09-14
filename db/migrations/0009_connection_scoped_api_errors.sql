ALTER TABLE api_errors ADD COLUMN connection_id TEXT NOT NULL DEFAULT 'default';
CREATE INDEX idx_api_errors_connection ON api_errors(provider, connection_id, last_seen_at DESC);
