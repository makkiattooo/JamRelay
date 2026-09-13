CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,

    spotify_track_id TEXT NOT NULL UNIQUE,
    spotify_uri TEXT NOT NULL UNIQUE,

    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,

    duration_ms INTEGER
        CHECK (duration_ms IS NULL OR duration_ms >= 0),

    source TEXT NOT NULL,

    confidence REAL
        CHECK (
            confidence IS NULL
            OR (confidence >= 0.0 AND confidence <= 1.0)
        ),

    verified_at INTEGER,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_tracks_title_artist
    ON tracks(title, artist);

CREATE INDEX idx_tracks_verified_at
    ON tracks(verified_at);


CREATE TABLE track_aliases (
    id INTEGER PRIMARY KEY,

    track_id INTEGER NOT NULL,

    normalized_title TEXT NOT NULL,
    normalized_artist TEXT NOT NULL,
    normalized_album TEXT NOT NULL DEFAULT '',

    hit_count INTEGER NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
    last_used_at INTEGER,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (track_id)
        REFERENCES tracks(id)
        ON DELETE CASCADE,

    UNIQUE (
        normalized_title,
        normalized_artist,
        normalized_album
    )
);

CREATE INDEX idx_track_aliases_track_id
    ON track_aliases(track_id);


CREATE TABLE api_errors (
    id INTEGER PRIMARY KEY,

    fingerprint TEXT NOT NULL UNIQUE,

    provider TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,

    status_code INTEGER,
    reason TEXT,
    message TEXT,

    retry_after_seconds INTEGER CHECK (retry_after_seconds IS NULL OR retry_after_seconds >= 0),

    request_id TEXT,
    operation TEXT,
    payload_hash TEXT,

    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,

    occurrences INTEGER NOT NULL DEFAULT 1 CHECK (occurrences >= 1),

    resolved_at INTEGER
);

CREATE INDEX idx_api_errors_provider_status
    ON api_errors(provider, status_code);

CREATE INDEX idx_api_errors_last_seen
    ON api_errors(last_seen_at DESC);

CREATE INDEX idx_api_errors_unresolved
    ON api_errors(last_seen_at DESC)
    WHERE resolved_at IS NULL;


CREATE TABLE resolver_attempts (
    id INTEGER PRIMARY KEY,

    query_title TEXT NOT NULL,
    query_artist TEXT,
    query_album TEXT,

    strategy TEXT NOT NULL
        CHECK (
            strategy IN (
                'database',
                'spotify_search',
                'web_search',
                'oembed',
                'manual'
            )
        ),

    status TEXT NOT NULL
        CHECK (
            status IN (
                'matched',
                'ambiguous',
                'unmatched',
                'failed'
            )
        ),

    track_id INTEGER,
    confidence REAL
        CHECK (
            confidence IS NULL
            OR (confidence >= 0.0 AND confidence <= 1.0)
        ),

    duration_ms INTEGER
        CHECK (duration_ms IS NULL OR duration_ms >= 0),

    error_id INTEGER,

    created_at INTEGER NOT NULL,

    FOREIGN KEY (track_id)
        REFERENCES tracks(id)
        ON DELETE SET NULL,

    FOREIGN KEY (error_id)
        REFERENCES api_errors(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_resolver_attempts_created
    ON resolver_attempts(created_at DESC);

CREATE INDEX idx_resolver_attempts_status
    ON resolver_attempts(status);

CREATE INDEX idx_resolver_attempts_track
    ON resolver_attempts(track_id);

CREATE INDEX idx_resolver_attempts_error
    ON resolver_attempts(error_id);


CREATE TABLE rate_limit_state (
    provider TEXT NOT NULL,
    scope TEXT NOT NULL,

    blocked_until INTEGER CHECK (blocked_until IS NULL OR blocked_until >= 0),
    retry_after_seconds INTEGER CHECK (retry_after_seconds IS NULL OR retry_after_seconds >= 0),

    reason TEXT,
    last_status_code INTEGER,

    updated_at INTEGER NOT NULL,

    PRIMARY KEY (
        provider,
        scope
    )
) WITHOUT ROWID;

CREATE INDEX idx_rate_limit_blocked_until
    ON rate_limit_state(blocked_until);


CREATE TABLE jobs (
    id INTEGER PRIMARY KEY,

    type TEXT NOT NULL,

    status TEXT NOT NULL
        CHECK (
            status IN (
                'pending',
                'waiting',
                'running',
                'completed',
                'failed',
                'cancelled'
            )
        ),

    payload_json TEXT NOT NULL,

    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),

    run_after INTEGER,

    last_error_id INTEGER,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    started_at INTEGER,
    completed_at INTEGER,

    FOREIGN KEY (last_error_id)
        REFERENCES api_errors(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_jobs_scheduler
    ON jobs(status, run_after);

CREATE INDEX idx_jobs_created
    ON jobs(created_at DESC);


CREATE TABLE job_items (
    id INTEGER PRIMARY KEY,

    job_id INTEGER NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),

    track_id INTEGER,

    status TEXT NOT NULL
        CHECK (
            status IN (
                'pending',
                'waiting',
                'completed',
                'failed',
                'skipped'
            )
        ),

    payload_json TEXT,

    error_id INTEGER,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (job_id)
        REFERENCES jobs(id)
        ON DELETE CASCADE,

    FOREIGN KEY (track_id)
        REFERENCES tracks(id)
        ON DELETE SET NULL,

    FOREIGN KEY (error_id)
        REFERENCES api_errors(id)
        ON DELETE SET NULL,

    UNIQUE(job_id, position)
);

CREATE INDEX idx_job_items_job_status
    ON job_items(job_id, status);

CREATE INDEX idx_job_items_track
    ON job_items(track_id);
