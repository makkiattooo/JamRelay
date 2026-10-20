import { McpPermissionEngine } from '../mcp/permissions.js';
import type { McpOAuthStore } from '../mcp/oauth.js';
import { getDatabase } from './database.js';
import { toolContext } from '../mcp/context.js';
import { getRateLimit, recordRateLimit } from './state.js';
import {
  claimEligibleJob,
  getJob,
  getNextJobItems,
  hasRemainingJobItems,
  isJobCancelled,
  noteJobFailure,
  recordJobError,
  setJobStatus,
  updateJobItem,
  updateJobPayload,
} from './jobs.js';
import type { ProviderRegistry } from '../providers/registry.js';
import { resolveCandidates } from '../music/normalize.js';
import { parseProviderIdentifier } from '../providers/identifiers.js';

export const JOB_TYPES = [
  'bulk_add_tracks',
  'add_tracks_by_search',
  'create_playlist_from_tracks',
] as const;
export type JobType = (typeof JOB_TYPES)[number];
export type TrackJobPayload = {
  provider: string;
  connection_id: string;
  phase?: 'created' | 'resolving' | 'ready_to_commit' | 'committing' | 'completed' | 'failed';
  playlist_id?: string;
  name?: string;
  strict?: boolean;
  dry_run?: boolean;
  skip_duplicates?: boolean;
  skip_existing?: boolean;
};
export type TrackJobItem = {
  id?: string;
  uri?: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
};
export type JobDefinition = { type: JobType; payload: TrackJobPayload; items: TrackJobItem[] };

export type JobResolver = {
  resolve(
    input: { title: string; artist: string; album?: string; year?: number },
    target?: { provider: string; connectionId: string },
  ): Promise<unknown>;
  hasConnection?: (connectionId: string, provider?: string) => boolean;
};
export function providerJobResolver(registry: ProviderRegistry, spotify: JobResolver): JobResolver {
  return {
    hasConnection: (id, provider) => {
      const c = registry.getConnection(id);
      return Boolean(c && c.summary.provider === provider && c.summary.connected !== false);
    },
    async resolve(input, target) {
      if (!target) throw new Error('JOB_TARGET_REQUIRED');
      const c = registry.getConnection(target.connectionId);
      if (!c || c.summary.provider !== target.provider || c.summary.connected === false)
        throw Object.assign(new Error('CONNECTION_UNAVAILABLE'), { permanent: true });
      if (!c.catalog || !c.summary.capabilities.catalog)
        throw Object.assign(new Error('CAPABILITY_UNSUPPORTED'), { permanent: true });
      if (target.provider === 'spotify' && target.connectionId === 'spotify-default')
        return spotify.resolve(input);
      const candidates = await c.catalog.searchTracks(`${input.title} ${input.artist}`);
      const match = resolveCandidates(
        candidates,
        input.title,
        input.artist,
        input.album,
        input.year,
      );
      if (match.status !== 'matched') return match;
      const id = match.match?.id;
      if (!id) throw Object.assign(new Error('INVALID_PROVIDER_RESOLUTION'), { permanent: true });
      return {
        ...match,
        id,
        uri: id,
        provider: target.provider,
        connection_id: target.connectionId,
      };
    },
  };
}
export type JobExecution = {
  id: number;
  provider: string;
  connectionId: string;
  signal: AbortSignal;
};
export type JobExecutor = (execution: JobExecution) => Promise<void>;
export class JobRunner {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private activeWork: Promise<void> | undefined;
  private controller: AbortController | undefined;
  readonly executors = new Map<string, JobExecutor>();
  constructor(
    private resolver: JobResolver,
    private logger?: {
      info?: (x: unknown, message: string) => void;
      warn?: (x: unknown, message: string) => void;
    },
    private permissionStore?: McpOAuthStore,
  ) {
    for (const type of JOB_TYPES)
      this.executors.set(type, (execution) => this.resolveItems(execution));
  }
  start() {
    if (!this.stopped || this.activeWork) return;
    this.stopped = false;
    void this.tick();
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.controller?.abort();
    await this.activeWork;
  }
  private async tick() {
    if (this.stopped) return;
    try {
      const id = claimEligibleJob();
      if (id) {
        this.controller = new AbortController();
        this.activeWork = this.process(id, this.controller.signal);
        await this.activeWork;
        this.activeWork = undefined;
        this.controller = undefined;
      }
    } catch {
      this.logger?.warn?.({ event: 'job_tick_failed' }, 'Queue tick failed');
    }
    if (!this.stopped) this.timer = setTimeout(() => void this.tick(), 250);
  }
  private async process(id: number, signal: AbortSignal) {
    const job = getJob(id, 0, 1);
    if (!job || isJobCancelled(id)) return;
    const provider = job.provider;
    const connectionId = job.connectionId;
    if (
      job.ownerClientId &&
      getDatabase()
        .prepare('SELECT 1 FROM operator_client_revocations WHERE client_id=? AND revoked_at>=?')
        .get(job.ownerClientId, job.createdAt)
    ) {
      recordJobError(id, 'CLIENT_REVOKED');
      setJobStatus(id, 'failed');
      return;
    }
    const executor = this.executors.get(job.type);
    if (!executor) {
      recordJobError(id, 'UNKNOWN_JOB_TYPE');
      setJobStatus(id, 'failed');
      return;
    }
    if (this.resolver.hasConnection && !this.resolver.hasConnection(connectionId, provider)) {
      recordJobError(id, 'CONNECTION_UNAVAILABLE');
      updateJobPayload(id, {
        ...job.payload,
        phase: 'failed',
        manual_review: true,
        manual_review_reason: 'original_provider_connection_unavailable',
      });
      setJobStatus(id, 'failed');
      return;
    }
    const cooldown = getRateLimit(provider, 'search', connectionId);
    if (cooldown && (cooldown.blockedUntil ?? 0) > Date.now()) {
      setJobStatus(id, 'waiting', cooldown.blockedUntil ?? undefined);
      return;
    }
    try {
      const saved = job.authorization ? JSON.parse(job.authorization) : undefined;
      if (
        job.ownerClientId &&
        (!saved || saved.clientId !== job.ownerClientId || !this.permissionStore)
      )
        throw new Error('CLIENT_REVOKED');
      const resolveAccess =
        job.ownerClientId && this.permissionStore
          ? () => this.permissionStore!.policyFor(job.ownerClientId, saved?.issuedAt)
          : undefined;
      await toolContext.run(
        {
          requestId: `job_${id}`,
          signal,
          deadlineAt: Date.now() + 300_000,
          operation: saved?.tool ?? 'create_bulk_job',
          mcpAccess: saved,
          resolveAccess,
        },
        async () => {
          await McpPermissionEngine.enforce(undefined, [connectionId]);
          await executor({ id, provider, connectionId, signal });
        },
      );
    } catch (error) {
      if (signal.aborted || isJobCancelled(id)) return;
      const e = error as {
        status?: number;
        retryAfter?: number;
        scope?: string;
        permanent?: boolean;
        message?: string;
      };
      if (e.status === 429) {
        const previous = getRateLimit(provider, e.scope ?? 'search', connectionId);
        const seconds = Math.max(
          Number.isFinite(e.retryAfter) ? Math.max(1, e.retryAfter!) : 60,
          Math.ceil(((previous?.blockedUntil ?? 0) - Date.now()) / 1000),
        );
        recordRateLimit(provider, e.scope ?? 'search', seconds, 'rate_limited', connectionId);
        const state = getRateLimit(provider, e.scope ?? 'search', connectionId);
        setJobStatus(
          id,
          'waiting',
          Math.max(Date.now() + seconds * 1000, state?.blockedUntil ?? 0),
        );
      } else if (
        ['CLIENT_REVOKED', 'PERMISSION_NOT_GRANTED', 'CONNECTION_NOT_GRANTED'].includes(
          e.message ?? '',
        )
      ) {
        recordJobError(id, e.message!);
        setJobStatus(id, 'failed');
      } else {
        recordJobError(
          id,
          e.permanent
            ? 'CAPABILITY_OR_CONNECTION_UNAVAILABLE'
            : e.status && e.status >= 400 && e.status < 500
              ? 'PROVIDER_PERMANENT_ERROR'
              : 'EXECUTION_FAILED',
        );
        if (e.permanent || (e.status && e.status >= 400 && e.status < 500 && e.status !== 408))
          setJobStatus(id, 'failed');
        else noteJobFailure(id);
      }
    }
  }
  private async resolveItems({ id, provider, connectionId, signal }: JobExecution) {
    const job = getJob(id, 0, 1);
    updateJobPayload(id, { ...job.payload, phase: 'resolving' });
    for (const item of getNextJobItems(id, 25)) {
      if (signal.aborted || isJobCancelled(id)) return;
      await McpPermissionEngine.enforce(undefined, [connectionId]);
      const input = JSON.parse(item.payload) as Record<string, unknown>;
      const resolution = await toolContext.run(
        {
          ...toolContext.get(),
          requestId: `job_${id}`,
          queueJobId: id,
          signal,
          deadlineAt: Date.now() + 60_000,
          operation: toolContext.get()?.operation ?? 'create_bulk_job',
        },
        async () => {
          if (typeof input.id === 'string' || typeof input.uri === 'string') {
            const reference = String(input.id ?? input.uri);
            const identifier =
              provider === 'spotify'
                ? parseProviderIdentifier(reference, provider, 'track')
                : /^[A-Za-z0-9_.-]+$/.test(reference)
                  ? { id: reference }
                  : (() => {
                      throw Object.assign(new Error('INVALID_PROVIDER_IDENTIFIER'), {
                        permanent: true,
                      });
                    })();
            return {
              status: 'matched',
              source: 'direct',
              provider,
              connection_id: connectionId,
              id: identifier.id,
              uri: provider === 'spotify' ? `spotify:track:${identifier.id}` : identifier.id,
            };
          }
          return this.resolver.resolve(
            {
              title: String(input.title),
              artist: String(input.artist),
              album: typeof input.album === 'string' ? input.album : undefined,
              year: typeof input.year === 'number' ? input.year : undefined,
            },
            { provider, connectionId },
          );
        },
      );
      if (signal.aborted || isJobCancelled(id)) return;
      const r = resolution as { status: string };
      if (r.status === 'waiting') {
        const state = getRateLimit(provider, 'search', connectionId);
        updateJobItem(item.id, 'waiting', { ...input, resolution });
        setJobStatus(id, 'waiting', state?.blockedUntil ?? Date.now() + 60_000);
        return;
      }
      updateJobItem(item.id, r.status === 'matched' ? 'completed' : 'failed', {
        ...input,
        resolution,
      });
    }
    if (signal.aborted || isJobCancelled(id)) return;
    if (hasRemainingJobItems(id)) setJobStatus(id, 'pending', Date.now());
    else updateJobPayload(id, { ...job.payload, phase: 'ready_to_commit' });
  }
}
