import { createHash, randomUUID } from 'node:crypto';
import type { NormalizedPlaylistTrack, OperationPlan } from './types.js';
import { fingerprint } from './normalize.js';
export function makePlan(input: {
  playlistId: string;
  operation: string;
  before: NormalizedPlaylistTrack[];
  after: NormalizedPlaylistTrack[];
  additions?: OperationPlan['additions'];
  removals?: OperationPlan['removals'];
  warnings?: string[];
  metrics?: Record<string, unknown>;
}): OperationPlan {
  const beforeUris = input.before.map((x) => x.uri),
    afterUris = input.after.map((x) => x.uri),
    moves = afterUris
      .map((uri, to) => ({ uri: uri!, to, from: beforeUris.indexOf(uri) }))
      .filter((x) => x.from >= 0 && x.from !== x.to);
  const hash = (x: string) => createHash('sha256').update(x).digest('hex');
  return {
    id: `plan_${randomUUID()}`,
    playlistId: input.playlistId,
    createdAt: Date.now(),
    operation: input.operation,
    originalTrackCount: input.before.length,
    expectedTrackCount: input.after.length,
    additions: input.additions ?? [],
    removals: input.removals ?? [],
    moves,
    replacements: [],
    warnings: input.warnings ?? [],
    metrics: input.metrics ?? {},
    estimatedApiCalls: Math.max(
      1,
      Math.ceil((input.additions?.length ?? 0) / 100) +
        Math.ceil((input.removals?.length ?? 0) / 100) +
        Math.min(moves.length, 100),
    ),
    destructive: Boolean(input.removals?.length),
    beforeFingerprint: hash(fingerprint(beforeUris)),
    expectedAfterFingerprint: hash(fingerprint(afterUris)),
  };
}
