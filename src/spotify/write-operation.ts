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
  options: { rollback?: () => Promise<void>; writeEmpty?: boolean } = {},
): Promise<WriteResult> {
  let written = 0,
    last_snapshot_id: string | undefined;
  const parts = chunks(items);
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
      const r = await write(parts[i], i);
      written += parts[i].length;
      last_snapshot_id = r?.snapshot_id ?? last_snapshot_id;
    } catch (error) {
      let rollback_attempted = false,
        rollback_succeeded = false,
        rollback_error: string | undefined;
      if (options.rollback) {
        rollback_attempted = true;
        try {
          await options.rollback();
          rollback_succeeded = true;
        } catch (e) {
          rollback_error = String(e);
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
        error: String(error),
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
