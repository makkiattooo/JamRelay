import { describe, expect, it, vi } from 'vitest';
import { PlaylistMutationService, type MutationState } from '../src/playlists/mutation-service.js';

const state = (uris: string[]): MutationState => ({
  raw: uris.map((uri) => ({ uri })),
  tracks: uris.map((uri) => ({ uri })),
});

describe('PlaylistMutationService', () => {
  it('runs snapshot, write, invalidate, reread, verify and record in order', async () => {
    const events: string[] = [];
    let current = state(['old']);
    const service = new PlaylistMutationService({
      read: async () => current,
      write: async (uris) => {
        events.push('write');
        current = state(uris);
      },
      restore: async () => undefined,
      snapshot: (_value, reason) => {
        events.push(`snapshot:${reason}`);
        return { id: reason, providerId: 'test', connectionId: 'test' };
      },
      invalidate: () => events.push('invalidate'),
      record: ({ status }) => events.push(`record:${status}`),
    });

    const result = await service.execute('replace', state(['old']), ['new']);
    expect(result.verification.ok).toBe(true);
    expect(events).toEqual([
      'snapshot:REPLACE',
      'write',
      'invalidate',
      'snapshot:replace_after',
      'record:completed',
    ]);
  });

  it('attempts rollback and records partial failure when verification fails', async () => {
    const restore = vi.fn(async () => undefined);
    const record = vi.fn();
    const service = new PlaylistMutationService({
      read: async () => state(['unexpected']),
      write: async () => undefined,
      restore,
      snapshot: (_value, reason) => ({ id: reason, providerId: 'test', connectionId: 'test' }),
      record,
    });

    const result = await service.execute('replace', state(['old']), ['new']);
    expect(result.partialFailure?.rollbackSucceeded).toBe(true);
    expect(restore).toHaveBeenCalledWith([{ uri: 'old' }]);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'partial_failure', rollbackSucceeded: true }),
    );
  });
});
