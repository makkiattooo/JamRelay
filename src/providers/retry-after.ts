/** Retry-After supports delta seconds and HTTP dates. No provider request sleeps here. */
export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value))
    return Number.isFinite(Number(value)) ? Math.ceil(Number(value)) : undefined;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : undefined;
}
