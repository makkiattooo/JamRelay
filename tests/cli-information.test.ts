import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectNpm, parseReleases, selectRelease, updateSummary } from '../src/cli/releases.js';
import { metadata, boundedJson } from '../src/cli/metadata.js';
import { feedSchema, filterNotices, notices, NOTICES_URL } from '../src/cli/notices.js';
import { cliPaths, changeState, readState } from '../src/cli/state.js';
import { runCli } from '../src/cli.js';
import { passiveHint } from '../src/cli/information.js';
let root: string;
const notice = {
  id: 'test',
  severity: 'security',
  title: 'Security information',
  message: 'Review the official advisory.',
  publishedAt: '2020-01-01T00:00:00Z',
  expiresAt: null,
  channels: ['stable', 'beta'],
  minVersion: null,
  maxVersion: null,
  url: 'https://github.com/makkiattooo/JamRelay/security',
};
const feed = () => ({
  schemaVersion: 1,
  generatedAt: '2020-01-01T00:00:00Z',
  notices: [{ ...notice }],
});
const release = (version: string, prerelease = false) => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease,
  html_url: `https://github.com/makkiattooo/JamRelay/releases/tag/v${version}`,
  published_at: '2020-01-01T00:00:00Z',
  name: version,
  body: 'Official release notes.',
});
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'jamrelay-information-'));
  vi.stubEnv('JAMRELAY_CONFIG_PATH', join(root, 'private.env'));
  vi.stubEnv('JAMRELAY_DATA_DIR', join(root, 'data'));
  vi.stubEnv('JAMRELAY_CLI_STATE_PATH', join(root, 'cli-state.json'));
  vi.stubEnv('JAMRELAY_CACHE_DIR', join(root, 'cache'));
  vi.stubEnv('JAMRELAY_INSTALL_MODE', 'local');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
it('uses exact SemVer, verified npm identity, dist-tags, engines and stable/beta GitHub selection', () => {
  const versions = ['1.5.0', '1.6.0-beta.2', '1.6.0-beta.10'];
  const data = {
    name: 'jamrelay',
    repository: { url: 'git+https://github.com/makkiattooo/JamRelay.git' },
    'dist-tags': { latest: versions[0], beta: versions[2], next: versions[1] },
    versions: Object.fromEntries(
      versions.map((version) => [version, { version, name: 'jamrelay' }]),
    ),
  };
  expect(selectNpm(data, 'stable').candidate).toBe('1.5.0');
  expect(selectNpm(data, 'beta').candidate).toBe('1.6.0-beta.10');
  expect(
    selectNpm({ ...data, repository: { url: 'https://github.com/attacker/JamRelay' } }, 'stable')
      .verified,
  ).toBe(false);
  const incompatible = {
    ...data,
    versions: {
      ...data.versions,
      [versions[2]]: { version: versions[2], name: 'jamrelay', engines: { node: '>=999' } },
    },
  };
  expect(selectNpm(incompatible, 'beta').candidate).toBe('1.6.0-beta.2');
  const releases = parseReleases([
    release('1.5.0'),
    release('1.6.0-beta.2', true),
    release('1.6.0-beta.10', true),
    { ...release('9.0.0'), draft: true },
  ]);
  expect(selectRelease(releases, 'stable')?.tag_name).toBe('v1.5.0');
  expect(selectRelease(releases, 'beta')?.tag_name).toBe('v1.6.0-beta.10');
});
it('keeps last good cache, supports ETag/304, offline and corrupted-cache recovery', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(feed()), { headers: { ETag: '"test"' } }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }))
    .mockRejectedValueOnce(new TypeError('offline'));
  vi.stubGlobal('fetch', fetch);
  const parse = (v: unknown) => feedSchema.parse(v);
  const first = await metadata('fixture', NOTICES_URL, parse, { refresh: true });
  expect(first.fresh).toBe(true);
  const second = await metadata('fixture', NOTICES_URL, parse, { refresh: true });
  expect(second.data).toEqual(first.data);
  expect(fetch.mock.calls[1][1].headers['If-None-Match']).toBe('"test"');
  expect(fetch.mock.calls[0][1].redirect).toBe('error');
  const failure = await metadata('fixture', NOTICES_URL, parse, { refresh: true });
  expect(failure.status).toBe('offline');
  expect(failure.data).toEqual(first.data);
  const cached = await metadata('fixture', NOTICES_URL, parse, { offline: true });
  expect(cached.source).toBe('cache');
  expect(cached.fresh).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(3);
  writeFileSync(join(cliPaths().cache, 'fixture.json'), 'invalid');
  expect((await metadata('fixture', NOTICES_URL, parse, { offline: true })).data).toBeNull();
});
it('strictly validates feeds, rejects terminal/HTML/bidi/duplicate IDs and bounds response depth/size', async () => {
  for (const message of [
    '\u001b]8;;https://evil.test\u0007text',
    '\u202eevil',
    '<script>bad</script>',
  ])
    expect(() => feedSchema.parse({ ...feed(), notices: [{ ...notice, message }] })).toThrow();
  expect(() => feedSchema.parse({ ...feed(), notices: [notice, notice] })).toThrow();
  expect(() =>
    feedSchema.parse({ ...feed(), notices: [{ ...notice, url: 'https://github.com/evil/other' }] }),
  ).toThrow();
  await expect(boundedJson(new Response('x'.repeat(300)), 100)).rejects.toThrow('SIZE');
  await expect(
    boundedJson(new Response('['.repeat(40) + '0' + ']'.repeat(40)), 1000),
  ).rejects.toThrow('DEPTH');
});
it('persists read/dismiss/channel state without touching secrets; dismissed security remains retrievable', async () => {
  writeFileSync(join(root, 'private.env'), 'TOKEN_ENCRYPTION_KEY="PRIVATE_CANARY"\n');
  await changeState((s) => {
    s.channel = 'beta';
    s.notifications = true;
    s.notices.test = { readAt: '2020-01-01T00:00:00Z', dismissed: true };
  });
  expect(readState().channel).toBe('beta');
  expect(readFileSync(join(root, 'private.env'), 'utf8')).toContain('PRIVATE_CANARY');
  const parsed = feedSchema.parse({
    ...feed(),
    notices: [
      notice,
      { ...notice, id: 'old', expiresAt: '2020-02-01T00:00:00Z' },
      { ...notice, id: 'stable-only', channels: ['stable'] },
    ],
  });
  expect(filterNotices(parsed).map((n) => n.id)).toEqual(['test']);
  expect(filterNotices(parsed, true).map((n) => n.id)).toEqual(['test', 'old']);
});
it('handles development versions, genuine 404s, GitHub prereleases, and verified GHCR tags without executing upgrades', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify([release('1.5.0')]))),
  );
  expect((await updateSummary({ refresh: true })).state).toBe('ahead_of_channel');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 404 }))),
  );
  expect((await updateSummary({ refresh: true })).state).toBe('not_published');
  vi.stubEnv('JAMRELAY_INSTALL_MODE', 'docker');
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'public-registry-token' })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ name: 'makkiattooo/jamrelay', tags: ['1.6.0-beta.10', '1.5.2'] }),
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const docker = await updateSummary({ refresh: true });
  expect(docker.state).toBe('update_available');
  expect(docker.command).toBe('docker pull ghcr.io/makkiattooo/jamrelay:1.5.2');
  expect(fetch.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer public-registry-token');
});
it('emits JSON only, works offline with bundled fallback, rejects bad arguments, and never opens SQLite or fetches in JSON info', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'SECRET_CANARY');
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await runCli(['info', '--json'])).toBe(0);
  const json = output.mock.calls.map((c) => String(c[0])).join('');
  expect(JSON.parse(json).application.version).toBe('1.5.1');
  expect(json).not.toContain('SECRET_CANARY');
  expect(fetch).not.toHaveBeenCalled();
  expect(existsSync(join(root, 'data', 'jamrelay.db'))).toBe(false);
  expect((await notices({ offline: true })).source).toBe('bundled');
  expect(await runCli(['notifications', 'enable', '--json'])).toBe(0);
  await passiveHint(['info', '--json']);
  expect(fetch).not.toHaveBeenCalled();
  expect(await runCli(['update', 'channel', 'beta', '--json'])).toBe(0);
  expect(readState().channel).toBe('beta');
  expect(await runCli(['update', 'check', '--offline', '--refresh', '--json'])).toBe(2);
  expect(await runCli(['changelog', '--version', 'invalid', '--json'])).toBe(2);
});

it('keeps missing-main bundled notices unverified and retains a previously valid feed on 404', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(feed())))
      .mockResolvedValueOnce(new Response(null, { status: 404 })),
  );
  const bundled = await notices({ refresh: true });
  expect(bundled.source).toBe('bundled');
  expect(bundled.fresh).toBe(false);
  expect(bundled.checkedAt).toBeNull();
  await notices({ refresh: true });
  const previous = await notices({ refresh: true });
  expect(previous.source).toBe('cache');
  expect(previous.notices[0].id).toBe('test');
  expect(previous.fresh).toBe(false);
});
