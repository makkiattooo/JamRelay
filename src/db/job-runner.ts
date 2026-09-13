import { toolContext } from '../mcp/context.js';
import { SpotifyApiError } from '../spotify/errors.js';
import { TrackResolver } from '../spotify/resolver.js';
import { parseSpotifyIdentifier } from '../spotify/identifiers.js';
import { getRateLimit } from './state.js';
import {
  claimEligibleJob,
  getJob,
  getJobItems,
  noteJobFailure,
  setJobStatus,
  updateJobItem,
  updateJobPayload,
} from './jobs.js';
import type { SpotifyClient } from '../spotify/client.js';

export class JobRunner {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  constructor(
    private client: SpotifyClient,
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
  }
  private async tick() {
    if (this.stopped) return;
    try {
      const id = claimEligibleJob();
      if (id) await this.process(id);
    } catch (error) {
      this.logger?.warn?.({ error }, 'State DB job tick failed');
    }
    if (!this.stopped) this.timer = setTimeout(() => void this.tick(), 250);
  }
  private async process(id: number) {
    const job = getJob(id, 0, 1);
    if (!job || job.status === 'cancelled') return;
    const payload = job.payload as Record<string, unknown>;
    const resolver = new TrackResolver(this.client);
    const items = getJobItems(id).filter((x) => x.status === 'pending' || x.status === 'waiting');
    const limit = 25;
    updateJobPayload(id, { ...payload, phase: 'resolving' });
    for (const item of items.slice(0, limit)) {
      const input = item.payload ? (JSON.parse(item.payload) as Record<string, unknown>) : {};
      try {
        let resolution: unknown;
        if (typeof input.id === 'string' || typeof input.uri === 'string') {
          const parsed = parseSpotifyIdentifier(String(input.id ?? input.uri), 'track');
          resolution = { status: 'matched', source: 'direct', uri: parsed.uri, id: parsed.id };
        } else {
          resolution = await toolContext.run(
            {
              requestId: `job_${id}`,
              signal: new AbortController().signal,
              deadlineAt: Date.now() + 15000,
              operation: `job:${String(job.type)}`,
            },
            () =>
              resolver.resolve({
                title: String(input.title),
                artist: String(input.artist),
                album: typeof input.album === 'string' ? input.album : undefined,
              }),
          );
        }
        const r = resolution as { status: string; uri?: string; id?: string };
        updateJobItem(item.id, r.status === 'matched' ? 'completed' : 'failed', {
          ...input,
          resolution,
        });
      } catch (error) {
        if (error instanceof SpotifyApiError && error.status === 429) {
          const state = getRateLimit('spotify', error.scope ?? 'search');
          setJobStatus(
            id,
            'waiting',
            state?.blockedUntil ?? Date.now() + (error.retryAfter ?? 60) * 1000,
          );
          updateJobItem(item.id, 'waiting', input);
          return;
        }
        const exhausted = noteJobFailure(id, (error as { apiErrorId?: number }).apiErrorId);
        updateJobItem(item.id, exhausted ? 'failed' : 'pending', {
          ...input,
          error: 'resolution_failed',
        });
        if (!exhausted) return;
      }
    }
    const remaining = getJobItems(id).some((x) => x.status === 'pending' || x.status === 'waiting');
    setJobStatus(id, remaining ? 'pending' : 'running');
    if (!remaining) updateJobPayload(id, { ...payload, phase: 'ready_to_commit' });
    this.logger?.info?.({ job_id: id }, 'State DB job progress updated');
  }
}
