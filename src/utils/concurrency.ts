export type MapLimitOptions = {
  concurrency: number;
  signal?: AbortSignal;
};

/** Maps independently processable work with bounded, deterministic concurrency. */
export async function mapLimit<T, R>(
  values: readonly T[],
  options: MapLimitOptions,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const concurrency = Math.max(1, Math.floor(options.concurrency));
  const results = new Array<R>(values.length);
  let next = 0;
  let firstError: unknown;
  const abort = () => {
    if (!firstError) firstError = new Error('operation_cancelled');
  };
  options.signal?.addEventListener('abort', abort, { once: true });

  const run = async () => {
    for (;;) {
      if (firstError || options.signal?.aborted) {
        abort();
        return;
      }
      const index = next++;
      if (index >= values.length) return;
      try {
        results[index] = await worker(values[index], index);
      } catch (error) {
        firstError = error;
        return;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
    if (firstError) throw firstError;
    return results;
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
}
