import type { NormalizedPlaylistTrack, OperationPlan } from './types.js';
import { makePlan } from './planner.js';
export function composePlans(
  playlistId: string,
  before: NormalizedPlaylistTrack[],
  stages: Array<{ name: string; tracks: NormalizedPlaylistTrack[]; warnings?: string[] }>,
): OperationPlan {
  const after = stages.at(-1)?.tracks ?? before;
  const warnings = stages.flatMap((s) => s.warnings ?? []);
  return makePlan({
    playlistId,
    operation: stages.map((s) => s.name).join('+') || 'composed',
    before,
    after,
    warnings,
    metrics: { stages: stages.map((s) => s.name) },
  });
}
