import { toolContext } from '../mcp/context.js';
import { mapLimit } from '../utils/concurrency.js';
import { getRateLimit } from './state.js';
import {
  claimEligibleJob,
  getJob,
  getNextJobItems,
  hasRemainingJobItems,
  noteJobFailure,
  setJobStatus,
  updateJobItem,
  updateJobPayload,
} from './jobs.js';

export type JobResolver = {
  resolve(input: {
    title: string;
    artist: string;
    album?: string;
    year?: number;
  }): Promise<unknown>;
  hasConnection?: (connectionId: string, provider?: string) => boolean;
};
export class JobRunner {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private activeWork: Promise<void> | undefined;
  private activeController: AbortController | undefined;
  constructor(
    private resolver: JobResolver,
    private logger?: {
      info?: (x: unknown, message: string) => void;
      warn?: (x: unknown, message: string) => void;
    },
  ) {}
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    void this.tick();
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.activeController?.abort();
    try {
      await this.activeWork;
    } catch (error) {
      this.logger?.warn?.({ error }, 'State DB job stopped with an in-flight error');
    }
  }
  private async tick() {
    if (this.stopped) return;
    try {
      const id = claimEligibleJob();
      if (id) {
        this.activeController = new AbortController();
        const work = this.process(id, this.activeController.signal);
        this.activeWork = work;
        try {
          await work;
        } finally {
          if (this.activeWork === work) this.activeWork = undefined;
          this.activeController = undefined;
        }
      }
    } catch (error) {
      this.logger?.warn?.({ error }, 'State DB job tick failed');
    }
    if (!this.stopped) this.timer = setTimeout(() => void this.tick(), 250);
  }
  private async process(id: number, signal: AbortSignal) {
    const job = getJob(id, 0, 1);
    if (!job || job.status === 'cancelled') return;
    const payload = job.payload as Record<string, unknown>;
    const targetProvider = String(payload.provider ?? 'spotify');
    const targetConnection = String(payload.connection_id ?? 'spotify-default');
    if (
      'hasConnection' in this.resolver &&
      this.resolver.hasConnection &&
      !this.resolver.hasConnection(targetConnection, targetProvider)
    ) {
      updateJobPayload(id, {
        ...payload,
        phase: 'failed',
        manual_review: true,
        manual_review_reason: 'original_provider_connection_unavailable',
        provider: targetProvider,
        connection_id: targetConnection,
      });
      setJobStatus(id, 'failed');
      return;
    }
    if (!payload.provider || !payload.connection_id)
      updateJobPayload(id, {
        ...payload,
        provider: targetProvider,
        connection_id: targetConnection,
      });
    const items = getNextJobItems(id, 25);
    const limit = 25;
    updateJobPayload(id, { ...payload, phase: 'resolving' });
    let providerRateLimited = false;
    const outcomes = await mapLimit(
      items.slice(0, limit),
      { concurrency: 4, signal },
      async (item) => {
        const input = item.payload ? (JSON.parse(item.payload) as Record<string, unknown>) : {};
        if (providerRateLimited) return { item, input, waiting: true as const };
        try {
          let resolution: unknown;
          if (typeof input.id === 'string' || typeof input.uri === 'string') {
            const reference = String(input.id ?? input.uri);
            resolution = {
              status: 'matched',
              source: 'direct',
              provider: targetProvider,
              connection_id: targetConnection,
              provider_track_id: reference,
              provider_uri: reference,
              id: reference,
              uri: reference,
            };
          } else {
            resolution = await toolContext.run(
              {
                requestId: `job_${id}`,
                signal,
                deadlineAt: Date.now() + 60_000,
                operation: `job:${String(job.type)}`,
              },
              () =>
                this.resolver.resolve({
                  title: String(input.title),
                  artist: String(input.artist),
                  album: typeof input.album === 'string' ? input.album : undefined,
                  year: typeof input.year === 'number' ? input.year : undefined,
                }),
            );
          }
          return { item, input, resolution };
        } catch (error) {
          if ((error as { status?: number }).status === 429) providerRateLimited = true;
          return { item, input, error };
        }
      },
    );
    for (const outcome of outcomes) {
      const { item, input } = outcome;
      try {
        if ('waiting' in outcome && outcome.waiting) {
          const state = getRateLimit(targetProvider, 'search', targetConnection);
          setJobStatus(id, 'waiting', state?.blockedUntil ?? Date.now() + 60000);
          updateJobItem(item.id, 'waiting', input);
          return;
        }
        if ('error' in outcome) throw outcome.error;
        const resolution = outcome.resolution;
        const r = resolution as { status: string; uri?: string; id?: string };
        if (r.status === 'waiting') {
          const state = getRateLimit(targetProvider, 'search', targetConnection);
          setJobStatus(id, 'waiting', state?.blockedUntil ?? Date.now() + 60000);
          updateJobItem(item.id, 'waiting', { ...input, resolution });
          return;
        }
        updateJobItem(item.id, r.status === 'matched' ? 'completed' : 'failed', {
          ...input,
          resolution,
        });
      } catch (error) {
        if (
          (error as { status?: number }).status === 429 ||
          (error as { name?: string }).name === 'ProviderApiError'
        ) {
          const providerError = error as {
            status?: number;
            scope?: string;
            retryAfter?: number;
            provider?: string;
            connectionId?: string;
          };
          if (providerError.status !== 429) throw error;
          const state = getRateLimit(
            providerError.provider ?? targetProvider,
            providerError.scope ?? 'search',
            providerError.connectionId ?? targetConnection,
          );
          setJobStatus(
            id,
            'waiting',
            state?.blockedUntil ?? Date.now() + (providerError.retryAfter ?? 60) * 1000,
          );
          updateJobItem(item.id, 'waiting', input);
          return;
        }
        const exhausted = noteJobFailure(id, (error as { apiErrorId?: number }).apiErrorId);
        updateJobItem(item.id, exhausted ? 'failed' : 'pending', {
          ...input,
          error: 'resolution_failed',
        });
        return;
      }
    }
    const remaining = hasRemainingJobItems(id);
    setJobStatus(id, remaining ? 'pending' : 'running');
    if (!remaining) updateJobPayload(id, { ...payload, phase: 'ready_to_commit' });
    this.logger?.info?.({ job_id: id }, 'State DB job progress updated');
  }
}
