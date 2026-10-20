import { getDatabase } from './database.js';
import { toolContext } from '../mcp/context.js';

export type JobStatus = 'pending' | 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled';
const maxPage = (value: number | undefined) => Math.min(100, Math.max(1, value ?? 25));

export function createJob(type: string, payload: unknown, items: unknown[], maxAttempts = 5) {
  const db = getDatabase();
  const now = Date.now();
  const access = toolContext.get()?.mcpAccess;
  if (
    access?.issuedAt !== undefined &&
    db
      .prepare('SELECT 1 FROM operator_client_revocations WHERE client_id=? AND revoked_at>=?')
      .get(access.clientId, access.issuedAt)
  )
    throw new Error('CLIENT_REVOKED');
  const original = (payload ?? {}) as Record<string, unknown>;
  const connectionId = String(
    original.connection_id ?? access?.connectionIds?.[0] ?? 'spotify-default',
  );
  if (access && !access.connectionIds?.includes(connectionId))
    throw new Error('CONNECTION_NOT_GRANTED');
  const provider = String(
    original.provider ?? (connectionId === 'spotify-default' ? 'spotify' : ''),
  );
  if (!provider) throw new Error('PROVIDER_REQUIRED');
  payload = { ...original, provider, connection_id: connectionId };
  db.exec('BEGIN IMMEDIATE');
  try {
    const job = db
      .prepare(
        'INSERT INTO jobs (type,status,payload_json,attempts,max_attempts,run_after,created_at,updated_at,provider,connection_id,owner_client_id,authorization_json) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        type,
        'pending',
        JSON.stringify(payload),
        maxAttempts,
        now,
        now,
        now,
        provider,
        connectionId,
        access?.clientId ?? null,
        access
          ? JSON.stringify({ ...access, tool: toolContext.get()?.operation ?? 'create_bulk_job' })
          : null,
      );
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
      'SELECT id,type,status,provider,connection_id as connectionId,owner_client_id as ownerClientId,authorization_json as authorization,cancellation_requested_at as cancellationRequestedAt,commit_state as commitState,result_json as result,last_error_code as lastErrorCode,manual_review as manualReview,payload_json as payload,attempts,max_attempts as maxAttempts,run_after as runAfter,last_error_id as lastErrorId,created_at as createdAt,updated_at as updatedAt,started_at as startedAt,completed_at as completedAt FROM jobs WHERE id=?',
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!job) return null;
  assertJobAccess(job);
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

export function getNextJobItems(id: number, limit = 25) {
  return getDatabase()
    .prepare(
      "SELECT id,position,track_id as trackId,status,payload_json as payload,error_id as errorId FROM job_items WHERE job_id=? AND status IN ('pending','waiting') ORDER BY position LIMIT ?",
    )
    .all(id, Math.min(100, Math.max(1, limit))) as Array<{
    id: number;
    position: number;
    trackId: number | null;
    status: string;
    payload: string;
    errorId: number | null;
  }>;
}

export function hasRemainingJobItems(id: number) {
  return Boolean(
    (
      getDatabase()
        .prepare(
          "SELECT 1 as present FROM job_items WHERE job_id=? AND status IN ('pending','waiting') LIMIT 1",
        )
        .get(id) as { present?: number } | undefined
    )?.present,
  );
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
      `UPDATE job_items SET status=?, payload_json=COALESCE(?,payload_json), track_id=COALESCE(?,track_id), error_id=COALESCE(?,error_id), updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id=job_items.job_id AND jobs.status NOT IN ('cancelled','completed') AND jobs.cancellation_requested_at IS NULL)`,
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

export function listJobs(
  offset = 0,
  limit?: number,
  filters: { status?: JobStatus; provider?: string; connectionId?: string; type?: string } = {},
) {
  const clauses: string[] = [];
  const args: (string | number)[] = [];
  if (filters.status) {
    clauses.push('status=?');
    args.push(filters.status);
  }
  if (filters.type) {
    clauses.push('type=?');
    args.push(filters.type);
  }
  if (filters.provider) {
    clauses.push('provider=?');
    args.push(filters.provider);
  }
  if (filters.connectionId) {
    clauses.push('connection_id=?');
    args.push(filters.connectionId);
  }
  const access = toolContext.get()?.mcpAccess;
  if (access) {
    clauses.push('owner_client_id=?');
    args.push(access.clientId);
    const ids = access.connectionIds ?? [];
    if (!ids.length) return [];
    clauses.push(`connection_id IN (${ids.map(() => '?').join(',')})`);
    args.push(...ids);
  }
  const conditions = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return getDatabase()
    .prepare(
      `SELECT id,type,status,provider,connection_id as connectionId,owner_client_id as ownerClientId,authorization_json as authorization,cancellation_requested_at as cancellationRequestedAt,commit_state as commitState,result_json as result,last_error_code as lastErrorCode,manual_review as manualReview,payload_json as payload,attempts,max_attempts as maxAttempts,run_after as runAfter,last_error_id as lastErrorId,created_at as createdAt,updated_at as updatedAt FROM jobs ${conditions} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, maxPage(limit), Math.max(0, offset))
    .map((job: any) => ({ ...job, payload: JSON.parse(String(job.payload)) }));
}

export function assertJobAccess(job: Record<string, unknown>) {
  const access = toolContext.get()?.mcpAccess;
  if (
    access &&
    (job.ownerClientId !== access.clientId ||
      !access.connectionIds?.includes(String(job.connectionId)))
  )
    throw new Error('JOB_ACCESS_DENIED');
}

/** One SQLite statement: the write lock covers selection, eligibility and transition. */
export function claimEligibleJob(now = Date.now()) {
  const row = getDatabase()
    .prepare(
      `UPDATE jobs SET status='running', updated_at=?, started_at=COALESCE(started_at,?)
    WHERE id=(SELECT id FROM jobs WHERE status IN ('pending','waiting') AND cancellation_requested_at IS NULL AND commit_state='none' AND manual_review=0 AND COALESCE(json_extract(payload_json,'$.phase'),'') NOT IN ('ready_to_commit','committing') AND (run_after IS NULL OR run_after<=?) ORDER BY created_at,id LIMIT 1)
    AND status IN ('pending','waiting') AND cancellation_requested_at IS NULL AND commit_state='none'
    RETURNING id`,
    )
    .get(now, now, now) as { id: number } | undefined;
  return row?.id ?? null;
}

// Critical external-write barriers need a synced WAL commit. Ordinary read
// progress retains the existing NORMAL policy and its bulk-operation throughput.
function durableWrite<T>(write: (db: ReturnType<typeof getDatabase>) => T): T {
  const db = getDatabase();
  const previous = Number(db.prepare('PRAGMA synchronous').get()?.synchronous);
  const change = previous < 2;
  if (change) db.exec('PRAGMA synchronous=FULL');
  try {
    return write(db);
  } finally {
    if (change) db.exec(`PRAGMA synchronous=${previous}`);
  }
}
export function reserveJobCommit(id: number) {
  return durableWrite(
    (db) =>
      Number(
        db
          .prepare(
            `UPDATE jobs SET commit_state='reserved',status='running',updated_at=?,payload_json=json_set(payload_json,'$.phase','committing','$.commit_started_at',?)
    WHERE id=? AND status IN ('pending','waiting','running') AND commit_state='none' AND cancellation_requested_at IS NULL AND manual_review=0 AND json_extract(payload_json,'$.phase')='ready_to_commit'`,
          )
          .run(Date.now(), Date.now(), id).changes,
      ) === 1,
  );
}
export function finishJobCommit(id: number, result: unknown, uncertain = false) {
  // Result, terminal state and the cancellation check share one synced write.
  durableWrite((db) =>
    db
      .prepare(
        `UPDATE jobs SET
    commit_state=CASE WHEN cancellation_requested_at IS NOT NULL OR ?=1 THEN 'uncertain' ELSE 'completed' END,
    result_json=?,manual_review=CASE WHEN cancellation_requested_at IS NOT NULL OR ?=1 THEN 1 ELSE 0 END,
    status=CASE WHEN cancellation_requested_at IS NOT NULL THEN 'cancelled' WHEN ?=1 THEN 'failed' ELSE 'completed' END,
    completed_at=?,updated_at=? WHERE id=? AND commit_state='reserved'`,
      )
      .run(
        uncertain ? 1 : 0,
        JSON.stringify(result),
        uncertain ? 1 : 0,
        uncertain ? 1 : 0,
        Date.now(),
        Date.now(),
        id,
      ),
  );
}
export function isJobCancelled(id: number) {
  const row = getDatabase()
    .prepare('SELECT status,cancellation_requested_at FROM jobs WHERE id=?')
    .get(id);
  return !row || row.status === 'cancelled' || row.cancellation_requested_at != null;
}
export function recordJobError(id: number, code: string) {
  getDatabase()
    .prepare('UPDATE jobs SET last_error_code=?,updated_at=? WHERE id=?')
    .run(code, Date.now(), id);
}

export function updateJobPayload(id: number, payload: unknown) {
  getDatabase()
    .prepare('UPDATE jobs SET payload_json=?,updated_at=? WHERE id=?')
    .run(JSON.stringify(payload), Date.now(), id);
}

export function retryDelay(attempt: number, random = Math.random) {
  const base = Math.min(300_000, 1000 * 2 ** Math.min(18, Math.max(0, attempt - 1)));
  return Math.min(300_000, Math.round(base * (1 + random() * 0.25)));
}
export function noteJobFailure(id: number, errorId?: number) {
  const row = getDatabase()
    .prepare(
      "UPDATE jobs SET attempts=attempts+1,updated_at=? WHERE id=? AND status='running' AND cancellation_requested_at IS NULL RETURNING attempts,max_attempts as maxAttempts",
    )
    .get(Date.now(), id) as { attempts: number; maxAttempts: number } | undefined;
  if (!row) return true;
  const exhausted = row.attempts >= row.maxAttempts;
  setJobStatus(
    id,
    exhausted ? 'failed' : 'pending',
    exhausted ? undefined : Date.now() + retryDelay(row.attempts),
    errorId,
  );
  return exhausted;
}
const transitions: Record<JobStatus, JobStatus[]> = {
  pending: ['running', 'waiting', 'failed', 'cancelled'],
  waiting: ['pending', 'running', 'failed', 'cancelled'],
  running: ['pending', 'waiting', 'completed', 'failed', 'cancelled'],
  failed: [],
  completed: [],
  cancelled: [],
};
export function setJobStatus(id: number, status: JobStatus, runAfter?: number, errorId?: number) {
  const now = Date.now();
  const sources = (Object.keys(transitions) as JobStatus[]).filter(
    (from) => from === status || transitions[from].includes(status),
  );
  return (
    Number(
      getDatabase()
        .prepare(
          `UPDATE jobs SET status=?,run_after=?,last_error_id=COALESCE(?,last_error_id),updated_at=?,started_at=CASE WHEN ?='running' THEN COALESCE(started_at,?) ELSE started_at END,completed_at=CASE WHEN ? IN ('completed','failed','cancelled') THEN ? ELSE completed_at END WHERE id=? AND status IN (${sources.map(() => '?').join(',')}) AND (cancellation_requested_at IS NULL OR ?='cancelled')`,
        )
        .run(
          status,
          runAfter ?? null,
          errorId ?? null,
          now,
          status,
          now,
          status,
          now,
          id,
          ...sources,
          status,
        ).changes,
    ) === 1
  );
}
export function resumeJob(id: number) {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const job = getJob(id, 0, 1);
    if (
      !job ||
      ['completed', 'cancelled', 'running'].includes(job.status) ||
      job.manualReview ||
      job.payload.manual_review ||
      job.commitState !== 'none'
    ) {
      db.exec('COMMIT');
      return false;
    }
    const updated = db
      .prepare(
        `UPDATE jobs SET status='pending',attempts=0,completed_at=NULL,run_after=MAX(COALESCE(run_after,0),?),updated_at=? WHERE id=? AND status IN ('failed','waiting','pending') AND commit_state='none' AND cancellation_requested_at IS NULL AND manual_review=0`,
      )
      .run(Date.now(), Date.now(), id);
    if (Number(updated.changes) === 1)
      db.prepare("UPDATE job_items SET status='pending' WHERE job_id=? AND status='failed'").run(
        id,
      );
    db.exec('COMMIT');
    return Number(updated.changes) === 1;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function cancelJob(id: number) {
  const job = getJob(id, 0, 1);
  if (!job) return false;
  return durableWrite(
    (db) =>
      Number(
        db
          .prepare(
            `UPDATE jobs SET status='cancelled',cancellation_requested_at=?,completed_at=?,updated_at=?,manual_review=CASE WHEN commit_state='reserved' THEN 1 ELSE manual_review END WHERE id=? AND status IN ('pending','waiting','running')`,
          )
          .run(Date.now(), Date.now(), Date.now(), id).changes,
      ) === 1,
  );
}
export function recoverInterruptedJobs(): number {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const uncertain = db
      .prepare(
        `UPDATE jobs SET status=CASE WHEN status='cancelled' THEN status ELSE 'failed' END,commit_state='uncertain',manual_review=1,last_error_code='INTERRUPTED_COMMIT',payload_json=json_set(payload_json,'$.phase','failed','$.manual_review',json('true'),'$.manual_review_reason','interrupted_commit'),updated_at=? WHERE commit_state IN ('reserved','uncertain') OR (status='running' AND json_extract(payload_json,'$.phase')='committing')`,
      )
      .run(Date.now());
    const resolving = db
      .prepare(
        `UPDATE jobs SET status='pending',run_after=?,updated_at=?,payload_json=json_set(payload_json,'$.phase','resolving') WHERE status='running' AND cancellation_requested_at IS NULL AND commit_state='none' AND manual_review=0 AND COALESCE(json_extract(payload_json,'$.phase'),'') != 'ready_to_commit'`,
      )
      .run(Date.now(), Date.now());
    db.exec('COMMIT');
    return Number(uncertain.changes) + Number(resolving.changes);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
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

/** Check between external requests, including provider-internal chunk loops. */
export function assertQueueJobActive() {
  const context = toolContext.get();
  if (context?.signal.aborted)
    throw Object.assign(new Error('OPERATION_CANCELLED'), { permanent: true });
  if (!context?.queueJobId) return;
  if (isJobCancelled(context.queueJobId))
    throw Object.assign(new Error('OPERATION_CANCELLED'), { permanent: true });
  const row = getDatabase()
    .prepare('SELECT owner_client_id,created_at FROM jobs WHERE id=?')
    .get(context.queueJobId);
  if (
    row?.owner_client_id &&
    getDatabase()
      .prepare('SELECT 1 FROM operator_client_revocations WHERE client_id=? AND revoked_at>=?')
      .get(String(row.owner_client_id), Number(row.created_at))
  )
    throw Object.assign(new Error('CLIENT_REVOKED'), { permanent: true });
}
