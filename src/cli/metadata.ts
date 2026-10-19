import { join } from 'node:path';
import { z } from 'zod';
import { atomicJson, readJson, cliPaths, cacheTtl } from './state.js';

export type FetchOptions = { offline?: boolean; refresh?: boolean };
export type Metadata<T> = {
  data: T | null;
  source: 'remote' | 'cache' | 'none';
  status: 'ok' | 'not_found' | 'offline' | 'error';
  checkedAt: string | null;
  fresh: boolean;
  problem?: 'network' | 'invalid_metadata' | 'http_error';
};
export const unsafeText =
  /[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/;
export const plainText = (text: string, max = 12000) =>
  text
    .replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][\s\S]*?(?:\x07|\x1b\\))/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g, '')
    .replace(/<[^>]*>/g, '')
    .slice(0, max);
export function officialUrl(value: string) {
  if (value.length > 1000 || unsafeText.test(value) || /[\r\n\t]/.test(value)) return false;
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      u.hostname === 'github.com' &&
      (u.pathname === '/makkiattooo/JamRelay' || u.pathname.startsWith('/makkiattooo/JamRelay/'))
    );
  } catch {
    return false;
  }
}
const allowed = (url: string) =>
  /^https:\/\/registry\.npmjs\.org\/(@[a-z0-9._-]+%2[fF])?[a-z0-9._-]+$/.test(url) ||
  url === 'https://ghcr.io/v2/makkiattooo/jamrelay/tags/list?n=100' ||
  url === 'https://api.github.com/repos/makkiattooo/JamRelay/releases?per_page=100' ||
  url === 'https://raw.githubusercontent.com/makkiattooo/JamRelay/main/.github/cli/notices.json';
export async function boundedJson(response: Response, limit: number) {
  const length = Number(response.headers.get('content-length'));
  if (length > limit) {
    await response.body?.cancel();
    throw new Error('SIZE');
  }
  if (!response.body) throw new Error('EMPTY');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error('SIZE');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const text = Buffer.concat(chunks).toString('utf8');
  // Bound nesting before JSON.parse/Zod, while ignoring braces inside JSON strings.
  let depth = 0,
    quoted = false,
    escaped = false;
  for (const c of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{' || c === '[') {
      if (++depth > 32) throw new Error('DEPTH');
    } else if (c === '}' || c === ']') depth--;
  }
  return JSON.parse(text) as unknown;
}
export async function metadata<T>(
  key: string,
  url: string,
  parse: (data: unknown) => T,
  options: FetchOptions = {},
  limit = 1_048_576,
  request: typeof fetch = fetch,
): Promise<Metadata<T>> {
  if (!allowed(url) || !/^[-a-z0-9]+$/.test(key)) throw new Error('Untrusted metadata endpoint');
  const path = join(cliPaths().cache, `${key}.json`);
  const envelope = z
    .object({
      schemaVersion: z.literal(1),
      checkedAt: z.string().datetime(),
      etag: z.string().max(500).nullable(),
      data: z.unknown(),
    })
    .strict();
  let cached: { checkedAt: string; etag: string | null; data: T | null } | null = null;
  try {
    const raw = envelope.parse(readJson(path, limit + 4096));
    cached = { ...raw, data: raw.data === null ? null : parse(raw.data) };
  } catch {
    /* invalid cache is ignored; never executed */
  }
  const age = cached ? Date.now() - Date.parse(cached.checkedAt) : Infinity;
  if (options.offline || (!options.refresh && age >= 0 && age < cacheTtl()))
    return {
      data: cached?.data ?? null,
      source: cached ? 'cache' : 'none',
      status: options.offline ? 'offline' : cached?.data === null ? 'not_found' : 'ok',
      checkedAt: cached?.checkedAt ?? null,
      fresh: false,
    };
  let problem: 'network' | 'invalid_metadata' | 'http_error' = 'network';
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'JamRelay-CLI',
    };
    if (cached?.etag && !/[\r\n]/.test(cached.etag)) headers['If-None-Match'] = cached.etag;
    const response = await request(url, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(2500),
    });
    const checkedAt = new Date().toISOString();
    let data: T | null;
    if (response.status === 304 && cached) data = cached.data;
    else if (response.status === 404) data = null;
    else {
      if (!response.ok) {
        problem = 'http_error';
        throw new Error('HTTP');
      }
      problem = 'invalid_metadata';
      data = parse(await boundedJson(response, limit));
      problem = 'network';
    }
    const rawEtag = response.headers.get('etag') || (response.status === 304 ? cached?.etag : null);
    const etag = rawEtag && rawEtag.length <= 500 && !/[\r\n]/.test(rawEtag) ? rawEtag : null;
    // A failed/disappearing remote source must not erase previously valid data.
    if (data !== null || !cached?.data)
      try {
        atomicJson(path, { schemaVersion: 1, checkedAt, etag, data });
      } catch {
        /* cache permissions must not prevent explicit reads */
      }
    return {
      data,
      source: 'remote',
      status: data === null ? 'not_found' : 'ok',
      checkedAt,
      fresh: true,
    };
  } catch {
    return {
      data: cached?.data ?? null,
      source: cached ? 'cache' : 'none',
      status: problem === 'network' ? 'offline' : 'error',
      checkedAt: cached?.checkedAt ?? null,
      fresh: false,
      problem,
    };
  }
}
