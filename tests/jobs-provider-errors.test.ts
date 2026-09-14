import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDatabase, initializeDatabase } from '../src/db/database.js';
import { createJob, getJob } from '../src/db/jobs.js';
import { JobRunner } from '../src/db/job-runner.js';
import { getRateLimit, recordRateLimit } from '../src/db/state.js';
import { ProviderApiError } from '../src/providers/errors.js';
import { toApiError } from '../src/http/errors.js';

let root: string | undefined;
afterEach(async () => {
  closeDatabase();
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe('provider-aware jobs, errors, and rate limits', () => {
  it('isolates a provider A rate limit from provider B', async () => {
    root = await mkdtemp(join(tmpdir(), 'jamrelay-rate-limit-'));
    initializeDatabase({ dataDir: root });
    recordRateLimit('alpha', 'search', 60, 'busy', 'alpha-main');
    expect(getRateLimit('alpha', 'search', 'alpha-main')).not.toBeNull();
    expect(getRateLimit('beta', 'search', 'beta-main')).toBeNull();
  });

  it('maps provider errors without losing provenance', () => {
    const error = toApiError(
      new ProviderApiError(429, 'Too many requests', 'alpha', 'alpha-main', {
        scope: 'search',
        capability: 'catalog',
        retryAfter: 12,
        providerCode: 'slow_down',
      }),
    );
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfter: 12 });
    expect(error.details).toMatchObject({
      provider: 'alpha',
      connection_id: 'alpha-main',
      upstream_status: 429,
      scope: 'search',
      capability: 'catalog',
      provider_code: 'slow_down',
    });
  });

  it('fails a migrated job closed when its original connection is unavailable', async () => {
    root = await mkdtemp(join(tmpdir(), 'jamrelay-job-safety-'));
    initializeDatabase({ dataDir: root });
    const id = createJob(
      'bulk_add_tracks',
      { phase: 'created', provider: 'alpha', connection_id: 'removed' },
      [{ id: 'provider:track:1' }],
    );
    const runner = new JobRunner({
      resolve: async () => ({ status: 'matched' }),
      hasConnection: () => false,
    });
    runner.start();
    const end = Date.now() + 1000;
    while (getJob(id, 0, 1).status !== 'failed' && Date.now() < end)
      await new Promise((r) => setTimeout(r, 10));
    await runner.stop();
    expect(getJob(id, 0, 1)).toMatchObject({
      status: 'failed',
      payload: {
        manual_review: true,
        manual_review_reason: 'original_provider_connection_unavailable',
      },
    });
  });
});
