import { getDatabase } from './database.js';

export type JobStatus = 'pending' | 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled';
const maxPage = (value: number | undefined) => Math.min(100, Math.max(1, value ?? 25));

export function createJob(type: string, payload: unknown, items: unknown[], maxAttempts = 5) {
  const db = getDatabase();
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    const job = db
      .prepare(
        'INSERT INTO jobs (type,status,payload_json,attempts,max_attempts,run_after,created_at,updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)',
      )
      .run(type, 'pending', JSON.stringify(payload), maxAttempts, now, now, now);
    const id = Number(job.lastInsertRowid);
    const insert = db.prepare(
      'INSERT INTO job_items (job_id,position,status,payload_json,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    items.forEach((item, position) =>
      insert.run(id, position, 'pending', JSON.stringify(item), now, now),
    );
    db.exec('COMMIT');
    return id;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  }
}

export function getJob(id: number, offset = 0, limit?: number): any {
  const db = getDatabase();
  const job = db
    .prepare(
      'SELECT id,type,status,payload_json as payload,attempts,max_attempts as maxAttempts,run_after as runAfter,last_error_id as lastErrorId,created_at as createdAt,updated_at as updatedAt,started_at as startedAt,completed_at as completedAt FROM jobs WHERE id=?',
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!job) return null;
  const items = db
    .prepare(
      'SELECT id,position,track_id as trackId,status,payload_json as payload,error_id as errorId,created_at as createdAt,updated_at as updatedAt FROM job_items WHERE job_id=? ORDER BY position LIMIT ? OFFSET ?',
    )
    .all(id, maxPage(limit), Math.max(0, offset));
  const counts = db
    .prepare('SELECT status, COUNT(*) as count FROM job_items WHERE job_id=? GROUP BY status')
    .all(id);
  return { ...job, payload: JSON.parse(String(job.payload)), items, counts };
}

export function getJobItems(id: number) {
  return getDatabase()
    .prepare(
      'SELECT id,position,track_id as trackId,status,payload_json as payload,error_id as errorId FROM job_items WHERE job_id=? ORDER BY position',
    )
    .all(id) as Array<{
    id: number;
    position: number;
    trackId: number | null;
    status: string;
    payload: string | null;
    errorId: number | null;
  }>;
}

export function updateJobItem(
  id: number,
  status: 'pending' | 'waiting' | 'completed' | 'failed' | 'skipped',
  payload?: unknown,
  trackId?: number,
  errorId?: number,
) {
  getDatabase()
    .prepare(
      'UPDATE job_items SET status=?, payload_json=COALESCE(?,payload_json), track_id=COALESCE(?,track_id), error_id=COALESCE(?,error_id), updated_at=? WHERE id=?',
    )
    .run(
      status,
      payload === undefined ? null : JSON.stringify(payload),
      trackId ?? null,
      errorId ?? null,
      Date.now(),
      id,
    );
}

export function listJobs(offset = 0, limit?: number) {
  return getDatabase()
    .prepare(
      'SELECT id,type,status,attempts,max_attempts as maxAttempts,run_after as runAfter,last_error_id as lastErrorId,created_at as createdAt,updated_at as updatedAt FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?',
    )
    .all(maxPage(limit), Math.max(0, offset));
}

export function claimEligibleJob(now = Date.now()) {
  const db = getDatabase();
  const row = db
    .prepare(
      "SELECT id FROM jobs WHERE status IN ('pending','waiting') AND (run_after IS NULL OR run_after<=?) ORDER BY created_at LIMIT 1",
    )
    .get(now) as { id: number } | undefined;
  if (!row) return null;
  const changed = db
    .prepare(
      "UPDATE jobs SET status='running', updated_at=?, started_at=COALESCE(started_at,?) WHERE id=? AND status IN ('pending','waiting')",
    )
    .run(now, now, row.id);
  return Number(changed.changes) === 1 ? row.id : null;
}

export function updateJobPayload(id: number, payload: unknown) {
  getDatabase()
    .prepare('UPDATE jobs SET payload_json=?,updated_at=? WHERE id=?')
    .run(JSON.stringify(payload), Date.now(), id);
}

export function noteJobFailure(id: number, errorId?: number) {
  const db = getDatabase();
  const row = db
    .prepare('SELECT attempts,max_attempts as maxAttempts FROM jobs WHERE id=?')
    .get(id) as { attempts: number; maxAttempts: number } | undefined;
  if (!row) return false;
  db.prepare('UPDATE jobs SET attempts=attempts+1,updated_at=? WHERE id=?').run(Date.now(), id);
  if (row.attempts + 1 >= row.maxAttempts) {
    setJobStatus(id, 'failed', undefined, errorId);
    return true;
  }
  setJobStatus(id, 'pending', Date.now());
  return false;
}

export function setJobStatus(id: number, status: JobStatus, runAfter?: number, errorId?: number) {
  const now = Date.now();
  getDatabase()
    .prepare(
      "UPDATE jobs SET status=?, run_after=?, last_error_id=COALESCE(?,last_error_id), updated_at=?, started_at=CASE WHEN ?='running' THEN COALESCE(started_at,?) ELSE started_at END, completed_at=CASE WHEN ? IN ('completed','failed','cancelled') THEN ? ELSE completed_at END WHERE id=?",
    )
    .run(status, runAfter ?? null, errorId ?? null, now, status, now, status, now, id);
}

export function cancelJob(id: number) {
  setJobStatus(id, 'cancelled');
}

export function recoverInterruptedJobs(): number {
  try {
    const db = getDatabase();
    const rows = db
      .prepare("SELECT id,payload_json as payload FROM jobs WHERE status='running'")
      .all() as Array<{ id: number; payload: string }>;
    for (const row of rows) {
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      if (payload.phase === 'committing') {
        updateJobPayload(row.id, {
          ...payload,
          phase: 'failed',
          manual_review: true,
          manual_review_reason: 'interrupted_commit',
        });
        setJobStatus(row.id, 'failed');
      } else {
        updateJobPayload(row.id, { ...payload, phase: 'resolving' });
        setJobStatus(row.id, 'pending', Date.now());
      }
    }
    return rows.length;
  } catch {
    return 0;
  }
}

export function listStateDiagnostics(provider?: string, connectionId?: string) {
  const db = getDatabase();
  return {
    database: 'ready',
    tracks: (db.prepare('SELECT COUNT(*) as count FROM tracks').get() as { count: number }).count,
    aliases: (db.prepare('SELECT COUNT(*) as count FROM track_aliases').get() as { count: number })
      .count,
    unresolvedErrors: (
      db.prepare('SELECT COUNT(*) as count FROM api_errors WHERE resolved_at IS NULL').get() as {
        count: number;
      }
    ).count,
    activeRateLimits: db
      .prepare(
        `SELECT provider,connection_id connectionId,scope,blocked_until as blockedUntil,retry_after_seconds as retryAfterSeconds,reason FROM rate_limit_state WHERE blocked_until > ? ${provider ? 'AND provider=?' : ''} ${connectionId ? 'AND connection_id=?' : ''}`,
      )
      .all(
        ...([
          Date.now(),
          ...(provider ? [provider] : []),
          ...(connectionId ? [connectionId] : []),
        ] as (string | number)[]),
      ),
    jobs: db.prepare('SELECT status,COUNT(*) as count FROM jobs GROUP BY status').all(),
  };
}
