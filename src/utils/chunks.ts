export function chunks<T>(items: readonly T[], size = 100): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('Invalid chunk size');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
