import { readFileSync } from 'node:fs';
import { z } from 'zod';
import semver from 'semver';
import { APP_VERSION } from '../version.js';
import { runtimePath } from '../runtime/installation.js';
import { metadata, unsafeText, officialUrl, type FetchOptions } from './metadata.js';
import { channelSchema, readState } from './state.js';
export const NOTICES_URL =
  'https://raw.githubusercontent.com/makkiattooo/JamRelay/main/.github/cli/notices.json';
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => !unsafeText.test(s) && !/[<>`]/.test(s), 'Plain text only');
const version = z
  .string()
  .max(100)
  .refine((v) => Boolean(semver.valid(v)));
export const noticeSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/),
    severity: z.enum(['info', 'warning', 'security']),
    title: text(160).refine((v) => !/[\n\t]/.test(v)),
    message: text(2000),
    publishedAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable().default(null),
    channels: z.array(channelSchema).min(1).max(2),
    minVersion: version.nullable().default(null),
    maxVersion: version.nullable().default(null),
    url: z.string().max(1000).refine(officialUrl).nullable().optional(),
  })
  .strict()
  .refine(
    (n) =>
      (!n.expiresAt || Date.parse(n.expiresAt) > Date.parse(n.publishedAt)) &&
      (!n.minVersion || !n.maxVersion || semver.lte(n.minVersion, n.maxVersion)),
  );
export const feedSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    notices: z.array(noticeSchema).max(100),
  })
  .strict()
  .refine(
    (f) => new Set(f.notices.map((n) => n.id)).size === f.notices.length,
    'Duplicate notice ID',
  );
export type Feed = z.infer<typeof feedSchema>;
export function filterNotices(feed: Feed, all = false, now = Date.now()) {
  const state = readState();
  return feed.notices
    .filter(
      (n) =>
        Date.parse(n.publishedAt) <= now &&
        n.channels.includes(state.channel) &&
        (!n.minVersion || semver.gte(APP_VERSION, n.minVersion)) &&
        (!n.maxVersion || semver.lte(APP_VERSION, n.maxVersion)),
    )
    .map((n) => ({
      ...n,
      expired: Boolean(n.expiresAt && Date.parse(n.expiresAt) <= now),
      readAt: state.notices[n.id]?.readAt ?? null,
      dismissed: state.notices[n.id]?.dismissed ?? false,
    }))
    .filter((n) => all || (!n.expired && (!n.dismissed || n.severity === 'security')))
    .sort(
      (a, b) =>
        ({ security: 0, warning: 1, info: 2 })[a.severity] -
        { security: 0, warning: 1, info: 2 }[b.severity],
    );
}
export async function notices(options: FetchOptions & { all?: boolean } = {}) {
  let result = await metadata('notices', NOTICES_URL, (v) => feedSchema.parse(v), options, 262144);
  if (result.status === 'not_found') {
    const previous = await metadata(
      'notices',
      NOTICES_URL,
      (v) => feedSchema.parse(v),
      { offline: true },
      262144,
    );
    if (previous.data) result = { ...previous, status: 'not_found' };
  }
  let data = result.data,
    source: string = result.source;
  if (!data) {
    data = feedSchema.parse(
      JSON.parse(readFileSync(runtimePath('.github', 'cli', 'notices.json'), 'utf8')),
    );
    source = 'bundled';
  }
  return {
    ...result,
    data: undefined,
    source,
    fresh: source === 'bundled' ? false : result.fresh,
    checkedAt: source === 'bundled' ? null : result.checkedAt,
    notices: filterNotices(data, options.all),
    message:
      source === 'bundled'
        ? 'Bundled development information; central notices become available when the feed reaches main.'
        : result.fresh
          ? 'Official project notices checked.'
          : 'Cached notices; freshness is not verified.',
  };
}
