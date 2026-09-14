-- Scope rate limits to a provider connection; legacy rows belong to the default connection.
ALTER TABLE rate_limit_state RENAME TO rate_limit_state_legacy;
CREATE TABLE rate_limit_state (
  provider TEXT NOT NULL,
  connection_id TEXT NOT NULL DEFAULT 'default',
  scope TEXT NOT NULL,
  blocked_until INTEGER CHECK (blocked_until IS NULL OR blocked_until >= 0),
  retry_after_seconds INTEGER CHECK (retry_after_seconds IS NULL OR retry_after_seconds >= 0),
  reason TEXT,
  last_status_code INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, connection_id, scope)
) WITHOUT ROWID;
INSERT INTO rate_limit_state (provider,connection_id,scope,blocked_until,retry_after_seconds,reason,last_status_code,updated_at)
SELECT provider,'default',scope,blocked_until,retry_after_seconds,reason,last_status_code,updated_at FROM rate_limit_state_legacy;
DROP INDEX idx_rate_limit_blocked_until;
DROP TABLE rate_limit_state_legacy;
CREATE INDEX idx_rate_limit_blocked_until ON rate_limit_state(blocked_until);
CREATE INDEX idx_rate_limit_connection ON rate_limit_state(provider,connection_id,scope);
