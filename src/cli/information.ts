import semver from 'semver';
import { translator, currentLanguage, knownMessage } from './i18n/index.js';
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
export function format(result: any, command: string) {
  const t = translator(currentLanguage());
  const prose = (s: string) => knownMessage(s);
  const guidance = (value: string) => {
    const prefix =
      /^(For Compose, explicitly set image: ghcr\.io\/makkiattooo\/jamrelay:)([^,]+),.*configuration\. /.exec(
        value,
      );
    return (
      (prefix
        ? t(
            'For Compose, explicitly set image: ghcr.io/makkiattooo/jamrelay:{0}, remove the local build entry if switching from source, then manually run docker compose up -d --no-deps jamrelay. Keep the same persistent volume and configuration.',
            prefix[2],
          ) + ' '
        : '') + prose(prefix ? value.slice(prefix[0].length) : value)
    );
  };
  if (command === 'info')
    return `JamRelay — ${t('System Information')}\n\n${t('Application')}\n  ${t('Version')}:        ${result.application.version}\n  ${t('Channel')}:        ${result.application.channel}\n  ${t('Runtime')}:        Node.js ${result.application.runtime}\n  ${t('Platform')}:       ${result.application.platform}\n  ${t('Installation')}:   ${result.application.installation}\n\n${t('Configuration')}\n  ${t('Config file')}:    ${result.configuration.file}\n  ${t('Data directory')}: ${result.configuration.dataDirectory}\n  ${t('MCP endpoint')}:   ${result.configuration.mcpEndpoint ?? t('not configured')}\n  ${t('Database')}:       ${prose(result.configuration.database)}\n\n${t('Updates')}\n  ${t('Last check')}:     ${result.updates.checkedAt ?? t('never')}\n  ${t('Latest known')}:   ${result.updates.latest ?? t('unavailable')}\n  ${t('Source')}:         ${result.updates.source} (${t('not verified-current')})\n  ${t('Notices')}:        ${result.notices.count}\n\n${t('Commands')}\n  jamrelay doctor\n  jamrelay update check\n  jamrelay notices`;
  if (command === 'update' && 'installed' in result)
    return `JamRelay ${t('Update Manager')}\n\n${t('Installed version')}: ${result.installed}\n${t('Channel')}:           ${result.channel}\n${t('Installation')}:      ${result.installation}\n${t('Latest published')}:  ${result.latest ?? t('unavailable')}\n${t('State')}:             ${result.state}\n${t('Source')}:            ${result.source}${result.fresh ? ' (' + t('verified this request') + ')' : ' (' + t('not verified-current') + ')'}\n${t('Last check')}:        ${result.checkedAt ?? t('never')}\n\n${prose(result.message)}\n${result.releaseUrl ? '\n' + t('Release notes') + ': ' + result.releaseUrl + '\n' : ''}${result.command ? '\n' + t('Suggested command') + ':\n' + result.command + '\n' : ''}\n${guidance(result.guidance ?? '')}`;
  if (command === 'changelog')
    return (
      `JamRelay ${t('Release Information')}\n${t('Source')}: ${result.source}; ${result.fresh ? t('checked now') : t('offline/cached/bundled; not verified-current')}\n\n` +
      (result.entries.length
        ? result.entries
            .map(
              (r: any) =>
                `${r.version} — ${r.source}${r.published ? '' : ' (' + t('local release information; publication unconfirmed') + ')'}\n${r.title}\n${r.body}\n${r.url ?? ''}`,
            )
            .join('\n\n')
        : t('No matching release information found.'))
    );
  if (command === 'notices' && Array.isArray(result.notices))
    return (
      `JamRelay ${t('Project Notices')}\n${t('Source')}: ${result.source}; ${t('last successful refresh')}: ${result.checkedAt ?? t('never')}\n${prose(result.message)}\n\n` +
      (result.notices.length
        ? result.notices
            .map(
              (n: any) =>
                `[${n.severity}] ${n.id}${n.expired ? ' [' + t('expired') + ']' : ''}${n.dismissed ? ' [' + t('dismissed') + ']' : ''}${n.readAt ? ' [' + t('read') + ']' : ''}\n${n.title}\n${n.message}\n${n.url ?? ''}`,
            )
            .join('\n\n')
        : t('No applicable notices.'))
    );
  if (command === 'notifications')
    return `${t('Notifications')}: ${prose(result.preference)}\n${result.stateFile}\n${prose(result.privacy)}`;
  if (command === 'update' && 'channel' in result) return `${t('Channel')}: ${result.channel}`;
  return `${result.id}: ${result.dismissed ? t('dismissed') : t('read')}`;
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
    else console.error(knownMessage(message));
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
      console.error(
        translator(currentLanguage())(
          'Notice [{0}]: {1} — run jamrelay notices',
          notice.severity,
          notice.title,
        ),
      );
      await changeState((s) => {
        s.notices[notice.id] = {
          ...(s.notices[notice.id] ?? { readAt: null, dismissed: false }),
          seenAt: new Date().toISOString(),
        };
      });
    } else if (update.state === 'update_available')
      console.error(
        translator(currentLanguage())(
          'Update: JamRelay {0} is available{1} — run jamrelay update check --refresh',
          update.latest,
          update.fresh ? '' : ' (' + knownMessage('cached') + ')',
        ),
      );
  } catch {
    /* optional hints can never break operational commands */
  }
}
