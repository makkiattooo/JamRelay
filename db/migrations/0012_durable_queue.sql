-- Forward-only queue metadata. Existing history and item ordering are retained.
ALTER TABLE jobs ADD COLUMN provider TEXT;
ALTER TABLE jobs ADD COLUMN connection_id TEXT;
ALTER TABLE jobs ADD COLUMN owner_client_id TEXT;
ALTER TABLE jobs ADD COLUMN authorization_json TEXT;
ALTER TABLE jobs ADD COLUMN cancellation_requested_at INTEGER;
ALTER TABLE jobs ADD COLUMN commit_state TEXT NOT NULL DEFAULT 'none' CHECK(commit_state IN ('none','reserved','completed','uncertain'));
ALTER TABLE jobs ADD COLUMN result_json TEXT;
ALTER TABLE jobs ADD COLUMN last_error_code TEXT;
ALTER TABLE jobs ADD COLUMN manual_review INTEGER NOT NULL DEFAULT 0;
UPDATE jobs SET provider=COALESCE(json_extract(payload_json,'$.provider'),'spotify'),
 connection_id=COALESCE(json_extract(payload_json,'$.connection_id'),'spotify-default');
UPDATE jobs SET commit_state='uncertain',manual_review=1 WHERE json_extract(payload_json,'$.phase')='committing';
CREATE INDEX jobs_eligible ON jobs(status,run_after,created_at) WHERE cancellation_requested_at IS NULL AND commit_state='none';
CREATE INDEX jobs_client_scope ON jobs(owner_client_id,connection_id);
-- Live local revocation overlay avoids racing the single-writer OAuth JSON store.
CREATE TABLE operator_client_revocations (client_id TEXT PRIMARY KEY, revoked_at INTEGER NOT NULL);
