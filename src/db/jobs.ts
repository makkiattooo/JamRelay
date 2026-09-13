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

export function getJob(id: number, offset = 0, limit?: number) {
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

export function setJobStatus(id: number, status: JobStatus, runAfter?: number, errorId?: number) {
  const now = Date.now();
  getDatabase()
    .prepare(
      'UPDATE jobs SET status=?, run_after=?, last_error_id=COALESCE(?,last_error_id), updated_at=?, started_at=CASE WHEN ?="running" THEN COALESCE(started_at,?) ELSE started_at END, completed_at=CASE WHEN ? IN ("completed","failed","cancelled") THEN ? ELSE completed_at END WHERE id=?',
    )
    .run(status, runAfter ?? null, errorId ?? null, now, status, now, status, now, id);
}

export function cancelJob(id: number) {
  setJobStatus(id, 'cancelled');
}

export function recoverInterruptedJobs(): number {
  try {
    const result = getDatabase()
      .prepare('UPDATE jobs SET status="pending", run_after=?, updated_at=? WHERE status="running"')
      .run(Date.now(), Date.now());
    return Number(result.changes);
  } catch {
    return 0;
  }
}

export function listStateDiagnostics() {
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
        'SELECT provider,scope,blocked_until as blockedUntil,retry_after_seconds as retryAfterSeconds,reason FROM rate_limit_state WHERE blocked_until > ?',
      )
      .all(Date.now()),
    jobs: db.prepare('SELECT status,COUNT(*) as count FROM jobs GROUP BY status').all(),
  };
}
