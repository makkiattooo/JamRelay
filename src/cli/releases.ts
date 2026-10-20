import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import semver from 'semver';
import { createHash } from 'node:crypto';
import { APP_PACKAGE_NAME, APP_VERSION } from '../version.js';
import {
  runtimePath,
  packageRoot,
  installationPaths,
  readSettings,
} from '../runtime/installation.js';
import { metadata, boundedJson, officialUrl, plainText, type FetchOptions } from './metadata.js';
import { readState } from './state.js';

export type Installation = 'npm' | 'docker' | 'source' | 'unknown';
export function installation(): Installation {
  if (process.env.JAMRELAY_INSTALL_MODE === 'docker') return 'docker';
  if (existsSync(runtimePath('.git'))) return 'source';
  if (/[\\/]node_modules[\\/]/.test(packageRoot)) return 'npm';
  if (existsSync('/.dockerenv')) return 'docker';
  return 'unknown';
}
export const RELEASES_URL =
  'https://api.github.com/repos/makkiattooo/JamRelay/releases?per_page=100';
const repository = z.union([
  z.string().max(1000),
  z.object({ url: z.string().max(1000) }).passthrough(),
]);
const manifest = z.object({
  name: z.string().max(214).optional(),
  version: z.string().max(100),
  repository: repository.optional(),
  engines: z.object({ node: z.string().max(200).optional() }).optional(),
});
export const npmSchema = z.object({
  name: z.string().max(214),
  repository: repository.optional(),
  'dist-tags': z.record(z.string().max(100), z.string().max(100)),
  versions: z.record(z.string().max(100), manifest),
});
const releaseSchema = z.object({
  tag_name: z.string().max(100),
  draft: z.boolean(),
  prerelease: z.boolean(),
  html_url: z.string().max(1000),
  published_at: z.string().datetime().nullable(),
  name: z.string().max(500).nullable().optional(),
  body: z.string().max(100000).nullable().optional(),
});
export function parseReleases(data: unknown) {
  return z
    .array(releaseSchema)
    .max(100)
    .parse(data)
    .filter(
      (r) =>
        !r.draft &&
        r.published_at &&
        Date.parse(r.published_at) <= Date.now() &&
        semver.valid(r.tag_name) &&
        officialUrl(r.html_url),
    )
    .map((r) => ({
      ...r,
      name: plainText(r.name || r.tag_name, 200),
      body: plainText(r.body || '', 12000),
    }));
}
export function officialRepository(value: unknown) {
  const raw = typeof value === 'string' ? value : (value as { url?: unknown })?.url;
  return (
    typeof raw === 'string' &&
    /^((git\+)?https:\/\/github\.com\/|git@github\.com:)makkiattooo\/jamrelay(\.git)?\/?$/i.test(
      raw,
    )
  );
}
export function selectNpm(
  data: z.infer<typeof npmSchema>,
  channel: 'stable' | 'beta',
  name = APP_PACKAGE_NAME,
) {
  if (data.name !== name || !officialRepository(data.repository))
    return { candidate: null, verified: false };
  const tags = channel === 'stable' ? ['latest'] : ['latest', 'beta', 'next'];
  const versions = tags
    .map((tag) => data['dist-tags'][tag])
    .filter((v): v is string =>
      Boolean(v && semver.valid(v) && (channel === 'beta' || !semver.prerelease(v))),
    );
  const candidate =
    versions.sort(semver.rcompare).find((v) => {
      const m = data.versions[v];
      return (
        m &&
        m.version === v &&
        (!m.name || m.name === name) &&
        (!m.repository || officialRepository(m.repository)) &&
        (!m.engines?.node || semver.satisfies(process.versions.node, m.engines.node))
      );
    }) ?? null;
  return { candidate, verified: true };
}
export function selectRelease(
  releases: ReturnType<typeof parseReleases>,
  channel: 'stable' | 'beta',
) {
  return (
    releases
      .filter((r) => channel === 'beta' || (!r.prerelease && !semver.prerelease(r.tag_name)))
      .sort((a, b) => semver.rcompare(a.tag_name, b.tag_name))[0] ?? null
  );
}
export function publishedReleases(options: FetchOptions = {}) {
  return metadata('github-releases', RELEASES_URL, parseReleases, options);
}
export function compareVersion(latest: string) {
  return semver.gt(APP_VERSION, latest)
    ? 'ahead_of_channel'
    : semver.lt(APP_VERSION, latest)
      ? 'update_available'
      : 'up_to_date';
}
const ghcrSchema = z.object({
  name: z.literal('makkiattooo/jamrelay'),
  tags: z.array(z.string().max(100)).max(100).nullable(),
});
async function ghcrRequest(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const tokenResponse = await fetch(
    'https://ghcr.io/token?scope=repository:makkiattooo/jamrelay:pull&service=ghcr.io',
    { redirect: 'error', signal: init?.signal },
  );
  if (!tokenResponse.ok) return new Response(null, { status: tokenResponse.status });
  const token = z
    .object({
      token: z
        .string()
        .min(1)
        .max(8192)
        .regex(/^[a-zA-Z0-9._~+\/-]+=*$/),
    })
    .parse(await boundedJson(tokenResponse, 16384)).token;
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, redirect: 'error' });
}
export async function updateSummary(options: FetchOptions = {}) {
  const mode = installation(),
    channel = readState().channel;
  const base = { installed: APP_VERSION, package: APP_PACKAGE_NAME, channel, installation: mode };
  let latest: string | null = null,
    verified = false,
    releaseUrl: string | null = null,
    command: string | null = null;
  let result;
  if (mode === 'npm') {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(APP_PACKAGE_NAME))
      return {
        ...base,
        state: 'unknown',
        latest: null,
        source: 'none',
        checkedAt: null,
        fresh: false,
        command: null,
        message: 'Unrecognized installed package identity.',
      };
    const encoded = APP_PACKAGE_NAME.replace('/', '%2f');
    result = await metadata(
      `npm-${createHash('sha256').update(APP_PACKAGE_NAME).digest('hex').slice(0, 16)}`,
      `https://registry.npmjs.org/${encoded}`,
      (v) => {
        const doc = npmSchema.parse(v);
        if (doc.name !== APP_PACKAGE_NAME || !officialRepository(doc.repository))
          throw new Error('Unverified package identity');
        return doc;
      },
      options,
      3 * 1048576,
    );
    if (result.data) {
      const selected = selectNpm(result.data, channel);
      latest = selected.candidate;
      verified = selected.verified;
    }
    if (verified && latest) command = `npm install -g ${APP_PACKAGE_NAME}@${latest}`;
  } else if (mode === 'docker') {
    result = await metadata(
      'ghcr-tags',
      'https://ghcr.io/v2/makkiattooo/jamrelay/tags/list?n=100',
      (v) => ghcrSchema.parse(v),
      options,
      65536,
      ghcrRequest as typeof fetch,
    );
    latest =
      result.data?.tags
        ?.filter((v) => Boolean(semver.valid(v)) && (channel === 'beta' || !semver.prerelease(v)))
        .sort(semver.rcompare)[0] ?? null;
    verified = Boolean(latest);
    if (latest) command = `docker pull ghcr.io/makkiattooo/jamrelay:${latest}`;
  } else {
    result = await publishedReleases(options);
    const candidate = result.data && selectRelease(result.data, channel);
    if (candidate) {
      latest = semver.valid(candidate.tag_name);
      releaseUrl = candidate.html_url;
      verified = true;
      command = `git fetch origin tag ${candidate.tag_name}\ngit checkout --detach ${candidate.tag_name}\nnpm ci\nnpm run build`;
    }
  }
  let state =
    latest && verified
      ? compareVersion(latest)
      : result.status === 'not_found' || (result.data && mode !== 'npm')
        ? 'not_published'
        : result.status === 'offline'
          ? 'offline'
          : result.status === 'error'
            ? 'error'
            : 'unknown';
  if (mode === 'npm' && result.status === 'not_found') state = 'not_published';
  // A failed/offline refresh cannot verify that a cached version remains available.
  const knownState = state;
  if (result.status === 'offline' || result.status === 'error') state = result.status;
  if (!latest || !verified || state !== 'update_available' || !result.fresh) command = null;
  if (mode === 'unknown') command = null;
  return {
    ...base,
    state,
    knownState,
    latest,
    verified,
    nodeCompatibility:
      mode === 'npm' && verified && latest
        ? 'checked against published engines when provided'
        : 'not declared in this metadata; review release notes',
    releaseUrl,
    command,
    source: result.source,
    checkedAt: result.checkedAt,
    fresh: result.fresh,
    message:
      state === 'not_published'
        ? `No official published ${mode === 'docker' ? 'image/tag' : mode === 'npm' ? 'npm release' : 'GitHub release'} found.`
        : result.status === 'offline'
          ? 'Could not reach the update service. Check the internet connection and try again.'
          : result.status === 'error'
            ? result.problem === 'invalid_metadata'
              ? 'The update service returned data JamRelay could not verify.'
              : 'The update service returned an error. Try again later.'
            : mode === 'docker' && !verified
              ? 'Official image availability is unverified.'
              : !verified && mode === 'npm'
                ? 'Package ownership/channel/Node compatibility could not be verified.'
                : result.fresh
                  ? 'Official public distribution metadata checked.'
                  : 'Cached information is not verified-current. Use --refresh for current availability.',
    guidance:
      (mode === 'docker' && latest && verified && result.fresh
        ? `For Compose, explicitly set image: ghcr.io/makkiattooo/jamrelay:${latest}, remove the local build entry if switching from source, then manually run docker compose up -d --no-deps jamrelay. Keep the same persistent volume and configuration. `
        : '') +
      'Stop the service and back up private configuration plus data before upgrading. Preserve encryption keys and persistent volumes. No upgrade is executed automatically.',
  };
}
export function bundledChangelog() {
  try {
    const text = plainText(readFileSync(runtimePath('CHANGELOG.md'), 'utf8'), 200000);
    const entries = [];
    const headings = [...text.matchAll(/^## (.+)$/gm)];
    for (let i = 0; i < headings.length; i++) {
      const version = /\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/.exec(headings[i][1])?.[1];
      if (version)
        entries.push({
          version,
          title: headings[i][1],
          body: text
            .slice(
              headings[i].index! + headings[i][0].length,
              headings[i + 1]?.index ?? text.length,
            )
            .trim()
            .slice(0, 12000),
          url: null,
          source: 'bundled',
          published: null,
        });
    }
    return entries;
  } catch {
    return [];
  }
}
export async function changelog(
  options: FetchOptions & { version?: string; latest?: boolean } = {},
) {
  const channel = readState().channel;
  const remote = await publishedReleases(options);
  const releases = (remote.data ?? [])
    .filter((r) => channel === 'beta' || (!r.prerelease && !semver.prerelease(r.tag_name)))
    .sort((a, b) => semver.rcompare(a.tag_name, b.tag_name));
  const published = releases.map((r) => ({
    version: semver.valid(r.tag_name)!,
    title: r.name,
    body: r.body,
    url: r.html_url,
    source: remote.source,
    published: true,
  }));
  const local = bundledChangelog().filter((r) => !published.some((p) => p.version === r.version));
  let entries = [...published, ...local].sort((a, b) => semver.rcompare(a.version, b.version));
  if (options.version) entries = entries.filter((r) => r.version === options.version);
  else if (options.latest) entries = published.length ? [published[0]] : local.slice(0, 1);
  return {
    source: remote.source,
    checkedAt: remote.checkedAt,
    fresh: remote.fresh,
    status: remote.status,
    entries: entries.slice(0, options.version || options.latest ? 1 : 5),
  };
}
export function installationInfo() {
  const paths = installationPaths();
  let saved: Record<string, string> = {};
  try {
    saved = readSettings(paths.config);
  } catch {
    /* metadata command remains usable */
  }
  const value = (key: string) => process.env[key] ?? saved[key];
  let endpoint: string | null = null;
  try {
    const url = new URL(value('PUBLIC_BASE_URL') || '');
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password)
      endpoint = `${url.origin}/mcp`;
  } catch {
    /* no configured endpoint */
  }
  return {
    application: {
      version: APP_VERSION,
      package: APP_PACKAGE_NAME,
      runtime: process.version,
      platform: `${process.platform}/${process.arch}`,
      installation: installation(),
      channel: readState().channel,
    },
    configuration: {
      file: paths.config,
      dataDirectory: value('JAMRELAY_DATA_DIR') || paths.data,
      mcpEndpoint: endpoint,
      database: value('JAMRELAY_DB_PATH') ? 'configured' : 'default path (not opened)',
    },
  };
}
