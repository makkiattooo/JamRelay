import semver from 'semver';
import { APP_VERSION } from '../version.js';
import { updateSummary, changelog, installationInfo } from './releases.js';
import { notices } from './notices.js';
import { changeState, readState, cliPaths, cacheTtl } from './state.js';
import { plainText } from './metadata.js';

export const informationCommands = ['info', 'update', 'changelog', 'notices', 'notifications'];
const usage =
  'Usage: jamrelay info [--json] | update [check [--refresh|--offline] [--json] | channel [stable|beta]] | changelog [--latest|--version X] [--json] | notices [--all] [--refresh|--offline] [--json] | notices read/dismiss ID | notifications status/enable/disable';
function ensure(condition: boolean): asserts condition {
  if (!condition) throw new Error('USAGE');
}
function format(result: any, command: string) {
  if (command === 'info')
    return `JamRelay — System Information\n\nApplication\n  Version:        ${result.application.version}\n  Channel:        ${result.application.channel}\n  Runtime:        Node.js ${result.application.runtime}\n  Platform:       ${result.application.platform}\n  Installation:   ${result.application.installation}\n\nConfiguration\n  Config file:    ${result.configuration.file}\n  Data directory: ${result.configuration.dataDirectory}\n  MCP endpoint:   ${result.configuration.mcpEndpoint ?? 'not configured'}\n  Database:       ${result.configuration.database}\n\nUpdates\n  Last check:     ${result.updates.checkedAt ?? 'never'}\n  Latest known:   ${result.updates.latest ?? 'unavailable'}\n  Source:         ${result.updates.source} (not verified-current)\n  Notices:        ${result.notices.count}\n\nCommands\n  jamrelay doctor\n  jamrelay update check\n  jamrelay notices`;
  if (command === 'update' && 'installed' in result)
    return `JamRelay Update Manager\n\nInstalled version: ${result.installed}\nChannel:           ${result.channel}\nInstallation:      ${result.installation}\nLatest published:  ${result.latest ?? 'unavailable'}\nState:             ${result.state}\nSource:            ${result.source}${result.fresh ? ' (verified this request)' : ' (not verified-current)'}\nLast check:        ${result.checkedAt ?? 'never'}\n\n${result.message}\n${result.releaseUrl ? '\nRelease notes: ' + result.releaseUrl + '\n' : ''}${result.command ? '\nSuggested command:\n' + result.command + '\n' : ''}\n${result.guidance ?? ''}`;
  if (command === 'changelog')
    return (
      `JamRelay Release Information\nSource: ${result.source}; ${result.fresh ? 'checked now' : 'offline/cached/bundled; not verified-current'}\n\n` +
      (result.entries.length
        ? result.entries
            .map(
              (r: any) =>
                `${r.version} — ${r.source}${r.published ? '' : ' (local release information; publication unconfirmed)'}\n${r.title}\n${r.body}\n${r.url ?? ''}`,
            )
            .join('\n\n')
        : 'No matching release information found.')
    );
  if (command === 'notices' && Array.isArray(result.notices))
    return (
      `JamRelay Project Notices\nSource: ${result.source}; last successful refresh: ${result.checkedAt ?? 'never'}\n${result.message}\n\n` +
      (result.notices.length
        ? result.notices
            .map(
              (n: any) =>
                `[${n.severity}] ${n.id}${n.expired ? ' [expired]' : ''}${n.dismissed ? ' [dismissed]' : ''}${n.readAt ? ' [read]' : ''}\n${n.title}\n${n.message}\n${n.url ?? ''}`,
            )
            .join('\n\n')
        : 'No applicable notices.')
    );
  return JSON.stringify(result, null, 2);
}
export async function runInformation(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  const json = rest.includes('--json');
  const words = rest.filter((s) => s !== '--json');
  try {
    ensure(rest.filter((s) => s === '--json').length <= 1);
    let result: unknown;
    if (command === 'info') {
      ensure(words.length === 0);
      const updates = await updateSummary({ offline: true });
      const feed = await notices({ offline: true });
      result = {
        ...installationInfo(),
        updates: {
          latest: updates.latest,
          checkedAt: updates.checkedAt,
          source: updates.source,
          fresh: false,
        },
        notices: { count: feed.notices.length, source: feed.source },
        notifications: { enabled: readState().notifications === true },
      };
    } else if (command === 'update') {
      if (words[0] === 'channel') {
        ensure(words.length <= 2 && (!words[1] || ['stable', 'beta'].includes(words[1])));
        if (words[1])
          await changeState((s) => {
            s.channel = words[1] as 'stable' | 'beta';
          });
        result = { channel: readState().channel };
      } else {
        const options = words[0] === 'check' ? words.slice(1) : words;
        ensure(
          options.every((s) => ['--refresh', '--offline'].includes(s)) &&
            !(options.includes('--refresh') && options.includes('--offline')) &&
            new Set(options).size === options.length,
        );
        result = await updateSummary({
          refresh: options.includes('--refresh'),
          offline: options.includes('--offline'),
        });
      }
    } else if (command === 'changelog') {
      let version: string | undefined;
      if (words.includes('--version')) {
        const index = words.indexOf('--version');
        ensure(Boolean(words[index + 1] && semver.valid(words[index + 1])));
        version = semver.valid(words[index + 1])!;
        words.splice(index, 2);
      }
      ensure(
        words.every((s) => ['--latest', '--offline', '--refresh'].includes(s)) &&
          new Set(words).size === words.length &&
          !(words.includes('--offline') && words.includes('--refresh')) &&
          !(version && words.includes('--latest')),
      );
      result = await changelog({
        version,
        latest: words.includes('--latest'),
        offline: words.includes('--offline'),
        refresh: words.includes('--refresh'),
      });
      if (version && !(result as any).entries.length) throw new Error('NOT_FOUND');
    } else if (command === 'notices') {
      if (words[0] === 'read' || words[0] === 'dismiss') {
        ensure(words.length === 2 && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(words[1]));
        const available = await notices({ offline: true, all: true });
        ensure(available.notices.some((n) => n.id === words[1]));
        const action = words[0],
          id = words[1];
        await changeState((s) => {
          const prior = s.notices[id] ?? { readAt: null, dismissed: false };
          s.notices[id] = {
            ...prior,
            ...(action === 'read' ? { readAt: new Date().toISOString() } : { dismissed: true }),
          };
        });
        result = { id, ...readState().notices[id] };
      } else {
        ensure(
          words.every((s) => ['--refresh', '--offline', '--all'].includes(s)) &&
            new Set(words).size === words.length &&
            !(words.includes('--refresh') && words.includes('--offline')),
        );
        result = await notices({
          refresh: words.includes('--refresh'),
          offline: words.includes('--offline'),
          all: words.includes('--all'),
        });
      }
    } else if (command === 'notifications') {
      ensure(words.length === 1 && ['status', 'enable', 'disable'].includes(words[0]));
      if (words[0] !== 'status')
        await changeState((s) => {
          s.notifications = words[0] === 'enable';
        });
      const preference = readState().notifications;
      result = {
        enabled: preference === true,
        preference: preference === null ? 'not selected' : preference ? 'enabled' : 'disabled',
        stateFile: cliPaths().state,
        privacy:
          'Optional public HTTPS release/notice metadata only. No telemetry, installation IDs, credentials or read receipts.',
      };
    } else throw new Error('USAGE');
    console.log(json ? JSON.stringify(result) : plainText(format(result, command), 75000));
    return (result as any)?.state === 'error' ? 1 : 0;
  } catch (error) {
    const message =
      error instanceof Error && error.message === 'USAGE'
        ? usage
        : error instanceof Error && error.message === 'NOT_FOUND'
          ? 'No release information found for the requested version.'
          : 'CLI information could not be read or saved. Check local state/cache permissions; no secrets are printed.';
    if (json) console.log(JSON.stringify({ error: message }));
    else console.error(message);
    return message === usage ? 2 : 1;
  }
}
export async function passiveHint(args: string[]) {
  if (
    !['info', 'status', 'doctor'].includes(args[0]) ||
    args.includes('--json') ||
    !process.stdout.isTTY ||
    !process.stdin.isTTY ||
    process.env.CI ||
    readState().notifications !== true
  )
    return;
  const now = Date.now(),
    state = readState();
  if (now - state.lastPassiveAttempt < cacheTtl() && state.lastPassiveAttempt <= now) return;
  try {
    // Persist attempts too, so disconnected terminals do not hit the network every invocation.
    await changeState((s) => {
      s.lastPassiveAttempt = now;
    });
    const [feed, update] = await Promise.all([notices(), updateSummary()]);
    const notice = feed.notices.find(
      (n) => !n.dismissed && !n.readAt && !state.notices[n.id]?.seenAt,
    );
    if (notice) {
      console.error(`Notice [${notice.severity}]: ${notice.title} — run jamrelay notices`);
      await changeState((s) => {
        s.notices[notice.id] = {
          ...(s.notices[notice.id] ?? { readAt: null, dismissed: false }),
          seenAt: new Date().toISOString(),
        };
      });
    } else if (update.state === 'update_available')
      console.error(
        `Update: JamRelay ${update.latest} is available${update.fresh ? '' : ' (cached)'} — run jamrelay update check --refresh`,
      );
  } catch {
    /* optional hints can never break operational commands */
  }
}
