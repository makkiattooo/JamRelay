import { McpPermissionEngine } from '../mcp/permissions.js';
import { toolContext } from '../mcp/context.js';
import { isJobCancelled } from '../db/jobs.js';
import { chunks } from '../utils/chunks.js';

export type WriteResult = {
  ok: boolean;
  partial: boolean;
  operation: string;
  playlist_id: string;
  requested_count: number;
  successfully_written_count: number;
  completed_chunks: number;
  failed_chunk_index?: number;
  last_snapshot_id?: string;
  rollback_attempted: boolean;
  rollback_succeeded: boolean;
  rollback_error?: string;
  error?: string;
};

export async function writeChunks<T>(
  operation: string,
  playlist_id: string,
  items: T[],
  write: (part: T[], index: number) => Promise<{ snapshot_id?: string } | null>,
  options: { rollback?: () => Promise<void>; writeEmpty?: boolean; chunkSize?: number } = {},
): Promise<WriteResult> {
  let written = 0;
  let last_snapshot_id: string | undefined;
  const parts = chunks(items, options.chunkSize ?? 100);
  if (!parts.length && !options.writeEmpty)
    return {
      ok: true,
      partial: false,
      operation,
      playlist_id,
      requested_count: 0,
      successfully_written_count: 0,
      completed_chunks: 0,
      rollback_attempted: false,
      rollback_succeeded: false,
    };
  if (!parts.length) parts.push([]);
  for (let i = 0; i < parts.length; i++) {
    try {
      const context = toolContext.get();
      if (context?.signal.aborted || (context?.queueJobId && isJobCancelled(context.queueJobId)))
        throw new Error('OPERATION_CANCELLED');
      await McpPermissionEngine.enforce();
      const result = await write(parts[i], i);
      written += parts[i].length;
      last_snapshot_id = result?.snapshot_id ?? last_snapshot_id;
    } catch (error) {
      let rollback_attempted = false;
      let rollback_succeeded = false;
      let rollback_error: string | undefined;
      if (options.rollback) {
        rollback_attempted = true;
        try {
          await options.rollback();
          rollback_succeeded = true;
        } catch (rollbackError) {
          rollback_error = 'ROLLBACK_FAILED';
        }
      }
      return {
        ok: false,
        partial: written > 0,
        operation,
        playlist_id,
        requested_count: items.length,
        successfully_written_count: written,
        completed_chunks: i,
        failed_chunk_index: i,
        last_snapshot_id,
        rollback_attempted,
        rollback_succeeded,
        rollback_error,
        error: 'PROVIDER_WRITE_FAILED',
      };
    }
  }
  return {
    ok: true,
    partial: false,
    operation,
    playlist_id,
    requested_count: items.length,
    successfully_written_count: written,
    completed_chunks: parts.length,
    last_snapshot_id,
    rollback_attempted: false,
    rollback_succeeded: false,
  };
}

export async function writePlaylistOrder(options: {
  playlistId: string;
  orderedTrackUris: string[];
  replace: (uris: string[]) => Promise<{ snapshot_id?: string } | null>;
  append: (uris: string[]) => Promise<{ snapshot_id?: string } | null>;
  rollback?: () => Promise<void>;
}) {
  return writeChunks(
    'write_playlist_order',
    options.playlistId,
    options.orderedTrackUris,
    (part, index) => (index === 0 ? options.replace(part) : options.append(part)),
    { rollback: options.rollback, writeEmpty: true },
  );
}
