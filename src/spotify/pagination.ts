export async function paginate<T>(
  fetchPage: (offset: number) => Promise<{ items: T[]; next?: string | null; total?: number }>,
  limit: number,
  cap = 10000,
  startOffset = 0,
) {
  const out: T[] = [];
  const seen = new Set<string>();
  const offsets = new Set<number>();
  let offset = startOffset;
  while (out.length < limit && offset < cap) {
    if (offsets.has(offset)) break;
    offsets.add(offset);
    const p = await fetchPage(offset);
    if (!p.items.length) break;
    out.push(...p.items);
    const next = p.next ?? '';
    if (!next) break;
    if (seen.has(next)) break;
    seen.add(next);
    const parsed = Number(new URL(next).searchParams.get('offset'));
    if (!Number.isFinite(parsed) || parsed <= offset) break;
    offset = parsed;
  }
  return out.slice(0, limit);
}
