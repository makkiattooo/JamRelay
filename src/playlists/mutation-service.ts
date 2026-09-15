export type MutationState = {
  raw: unknown[];
  tracks: Array<{ uri?: string | null }>;
  [key: string]: unknown;
};

export type MutationServiceDependencies = {
  read: () => Promise<MutationState>;
  write: (orderedUris: string[]) => Promise<void>;
  restore: (raw: unknown[]) => Promise<void>;
  snapshot: (
    state: MutationState,
    reason: string,
  ) => {
    id: string;
    providerId?: string | null;
    connectionId?: string | null;
  };
  record: (input: {
    status: 'completed' | 'partial_failure';
    beforeSnapshotId: string;
    afterSnapshotId?: string;
    error?: string;
    rollbackAttempted?: boolean;
    rollbackSucceeded?: boolean;
    rollbackError?: string;
  }) => void;
  invalidate?: () => void;
};

/**
 * Provider-neutral mutation lifecycle. Domain callers supply the provider
 * gateway and persistence callbacks, while this service owns the invariant:
 * snapshot before write, invalidate/read after write, verify, and safe rollback.
 */
export class PlaylistMutationService {
  constructor(private readonly dependencies: MutationServiceDependencies) {}

  async execute(operation: string, before: MutationState, orderedUris: string[]) {
    const safety = this.dependencies.snapshot(before, operation.toUpperCase());
    try {
      await this.dependencies.write(orderedUris);
      this.dependencies.invalidate?.();
      const after = await this.dependencies.read();
      const actual = after.tracks.map((track) => track.uri).filter(Boolean);
      const expected = orderedUris.filter(Boolean);
      const verified =
        actual.length === expected.length && actual.every((uri, index) => uri === expected[index]);
      if (!verified) throw new Error('playlist_integrity_mismatch');
      const afterSnapshot = this.dependencies.snapshot(after, operation + '_after');
      this.dependencies.record({
        status: 'completed',
        beforeSnapshotId: safety.id,
        afterSnapshotId: afterSnapshot.id,
      });
      return {
        safetySnapshotId: safety.id,
        afterSnapshotId: afterSnapshot.id,
        after,
        verification: { ok: true, count: actual.length },
      };
    } catch (error) {
      let rollbackAttempted = false;
      let rollbackSucceeded = false;
      let rollbackError: string | undefined;
      try {
        rollbackAttempted = true;
        await this.dependencies.restore(before.raw);
        rollbackSucceeded = true;
      } catch (rollbackFailure) {
        rollbackError = String(rollbackFailure);
      }
      this.dependencies.record({
        status: 'partial_failure',
        beforeSnapshotId: safety.id,
        error: String(error),
        rollbackAttempted,
        rollbackSucceeded,
        rollbackError,
      });
      return {
        safetySnapshotId: safety.id,
        afterSnapshotId: undefined,
        verification: { ok: false, count: 0 },
        partialFailure: {
          completed: false,
          error: String(error),
          rollbackAttempted,
          rollbackSucceeded,
          rollbackError,
        },
      };
    }
  }
}
