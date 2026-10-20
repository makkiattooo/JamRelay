#!/usr/bin/env node
import { manageCliWarnings } from './runtime/warnings.js';
import { existsSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';
import { Writable } from 'node:stream';
import { APP_VERSION } from './version.js';
import { translator, currentLanguage, knownMessage, errorLanguage } from './cli/i18n/index.js';
import {
  isInstallationConfigured,
  loadInstallation,
  lockInstallation,
  readSettings,
  saveSettings,
} from './runtime/installation.js';
import {
  beginTuiSession,
  menuPanel,
  promptText,
  selectOption,
  setTuiContext,
  showPanel,
  waitForEnter,
} from './cli/tui.js';

export function cliHelp() {
  const t = translator(currentLanguage());
  return `JamRelay — ${t('self-hosted music MCP server')}
${t('Usage')}: jamrelay <command>
  setup [--yes]       ${t('Configure installation (interactive; --yes uses environment)')}
  owner password     Set or change the owner password (stop server first)
  config             ${t('Safely reconfigure existing installation')}
  onboard             ${t('Open the management menu')}
  connect provider|client NAME  ${t('Configure a music provider or MCP client')}
  connectivity [--json] ${t('Configure or verify local and public access')}
  start              ${t('Run the MCP HTTP server')}
  status | doctor    ${t('Installation status / configuration diagnostics')}
  connections list
  clients list | clients show ID | clients permissions [set] ID | clients policy | clients revoke ID
  jobs list | jobs inspect/cancel/resume ID
  diagnostics
  backup create | backup list
  info [--json]
  update [check [--refresh|--offline] | channel [stable|beta]]
  changelog [--latest|--version X] [--json]
  notices [--refresh|--offline] [--all] | notices read/dismiss ID
  notifications status/enable/disable
  --help | --version
${t('Operator commands support --json. JAMRELAY_CONFIG_PATH selects a private env file.')}`;
}

function watchConfigurationRequests(configPath: string) {
  const dataPath = process.env.JAMRELAY_DATA_DIR ?? '/data';
  const requestPath = `${dataPath}/.jamrelay-reconfigure-request.json`;
  let processing = false;
  let restarting = false;
  const timer = setInterval(async () => {
    if (processing || !existsSync(requestPath)) return;
    processing = true;
    let request: { id?: string; config?: string; settings?: Record<string, string> } | undefined;
    try {
      const parsed = JSON.parse(readFileSync(requestPath, 'utf8')) as {
        id?: string;
        config?: string;
        settings?: Record<string, string>;
      };
      request = parsed;
      if (
        !parsed.id ||
        parsed.config !== configPath ||
        !parsed.settings ||
        typeof parsed.settings !== 'object'
      )
        throw new Error('Invalid configuration request.');
      const settings = { ...readSettings(configPath), ...parsed.settings };
      // Validate with the same schema used by setup before replacing the live file.
      const { validateSettings } = await import('./runtime/setup.js');
      validateSettings(settings);
      saveSettings(configPath, settings);
      unlinkSync(requestPath);
      writeFileSync(
        `${dataPath}/.jamrelay-reconfigure-${parsed.id}.json`,
        JSON.stringify({ id: parsed.id, ok: true }),
        { mode: 0o600 },
      );
      clearInterval(timer);
      restarting = true;
      process.kill(process.pid, 'SIGTERM');
    } catch (error) {
      try {
        if (request?.id) {
          unlinkSync(requestPath);
          writeFileSync(
            `${dataPath}/.jamrelay-reconfigure-${request.id}.json`,
            JSON.stringify({
              id: request.id,
              ok: false,
              message: error instanceof Error ? error.message : String(error),
            }),
            { mode: 0o600 },
          );
        }
      } catch {
        // Leave the running server untouched if request recovery also fails.
      }
      processing = false;
    }
  }, 500);
  timer.unref();
  return { stop: () => clearInterval(timer), isRestarting: () => restarting };
}
export const help = cliHelp();
let postTuiMessage: string | undefined;
let postTuiIsError = false;

async function showInteractiveHelp() {
  const language = currentLanguage();
  const t = translator(language);
  const sections = [
    {
      label: t('Setup and main menu'),
      details: t(
        'jamrelay setup — first-time setup: choose a run mode and save JamRelay settings.\njamrelay config — safely change settings for an existing installation; stop the server first.\njamrelay onboard — open the main menu for managing JamRelay.',
      ),
    },
    {
      label: t('Network and server'),
      details: t(
        'jamrelay connectivity — configure or check how clients reach JamRelay.\njamrelay start — run the JamRelay server.\njamrelay status — see whether the installation and server are ready.\njamrelay doctor — find configuration problems.\njamrelay diagnostics — collect troubleshooting details.',
      ),
    },
    {
      label: t('Music and AI clients'),
      details: t(
        'jamrelay connect provider NAME — enter credentials for a music service. Account authorization happens separately.\njamrelay connect client NAME — show setup instructions for an AI app such as Claude or Codex.\njamrelay connections list — see saved music services and their authorization state.\njamrelay clients list — see registered AI apps. Use `jamrelay clients show ID` for details and `jamrelay clients revoke ID` to remove access.',
      ),
    },
    {
      label: t('Security and maintenance'),
      details: t(
        'jamrelay owner password — change the owner password; stop JamRelay first.\njamrelay clients permissions — edit what an AI app may do.\njamrelay jobs list — inspect background tasks.\njamrelay backup create / list — create or view backups.\njamrelay info — show version and installation details.\njamrelay update check — check for updates. `jamrelay changelog` shows release notes.\njamrelay notices — read update notices. `jamrelay notifications status` shows notification settings.',
      ),
    },
  ];
  setTuiContext({ step: null, total: null, language });
  for (;;) {
    showPanel(t('JamRelay command guide'), t('Choose a section to see what its commands do.'));
    const section = await selectOption(
      sections.map((item, index) => ({ value: index, label: item.label })),
      0,
      (cursor) =>
        menuPanel(
          t('JamRelay command guide'),
          sections.map((item) => item.label),
          cursor,
        ),
    );
    if (section === undefined) return;
    const selected = sections[section];
    showPanel(selected.label, selected.details);
    const next = await selectOption(
      [
        { value: 'back', label: t('Back to sections') },
        { value: 'exit', label: t('Exit help') },
      ],
      0,
      (cursor) => menuPanel(selected.label, [t('Back to sections'), t('Exit help')], cursor),
    );
    if (next === 'exit') return;
  }
}

export async function runCli(args: string[]) {
  const helpCommand = !args[0] || ['help', '--help', '-h'].includes(args[0]);
  const interactive = Boolean(
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    !args.includes('--json') &&
    !args.includes('--yes'),
  );
  const restoreWarnings = manageCliWarnings(interactive);
  const endTui = interactive ? beginTuiSession() : () => {};
  try {
    // `docker compose run` can expose a TTY while still closing stdin (for
    // example, when a local wrapper starts the container without `-i`). Help
    // must remain usable in that case and must never surface a setup error.
    if (helpCommand) {
      if (interactive) {
        try {
          await showInteractiveHelp();
        } catch (error) {
          if (!(error instanceof Error) || error.message !== 'Setup cancelled.') throw error;
          console.log(cliHelp());
        }
      } else {
        console.log(cliHelp());
      }
      return 0;
    }

    const captured: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    if (interactive) {
      console.log = (...values: unknown[]) => captured.push(format(...values));
      console.error = (...values: unknown[]) => captured.push(`! ${format(...values)}`);
    }
    let code: number;
    try {
      code = await dispatchCli(args);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
    const message = postTuiMessage;
    postTuiMessage = undefined;
    const t = translator(currentLanguage());
    if (interactive && message) {
      showPanel(t(postTuiIsError ? 'Command needs attention' : 'Command result'), message);
      await waitForEnter(t('Press Enter to return to the terminal'));
    } else if (interactive && captured.length) {
      showPanel(
        t(
          captured.some((line) => line.startsWith('! '))
            ? 'Command needs attention'
            : 'Command result',
        ),
        captured.join('\n\n'),
      );
      await waitForEnter(t('Press Enter to return to the terminal'));
    } else if (message) console.log(message);
    postTuiIsError = false;
    return code;
  } catch (error) {
    if (error instanceof Error && error.message === 'Setup cancelled.') return 130;
    throw error;
  } finally {
    endTui();
    restoreWarnings();
  }
}
async function dispatchCli(args: string[]) {
  const help = cliHelp();
  const [command, ...rest] = args;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    if (process.stdin.isTTY && process.stdout.isTTY) await showInteractiveHelp();
    else console.log(help);
    return 0;
  }
  if (command === '--version' || command === '-v') {
    console.log(APP_VERSION);
    return 0;
  }
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    console.error(knownMessage('Node.js >=22.13.0 is required.'));
    return 1;
  }
  try {
    if (['info', 'update', 'changelog', 'notices', 'notifications'].includes(command)) {
      const information = await import('./cli/information.js');
      const code = await information.runInformation(args);
      if (code === 0) await information.passiveHint(args);
      return code;
    }
    if (command === 'owner' && rest.length === 1 && rest[0] === 'password') {
      await (await import('./runtime/setup.js')).setOwnerPassword();
      return 0;
    }
    if (command === 'setup' || command === 'config') {
      if (rest.some((s) => s !== '--yes')) {
        console.error(help);
        return 2;
      }
      const configured = await (
        await import('./runtime/setup.js')
      ).setup(rest.includes('--yes'), command === 'config');
      if (command === 'setup') {
        const t = translator(currentLanguage());
        const canStartHere =
          configured === undefined &&
          process.env.JAMRELAY_INSTALL_MODE !== 'docker' &&
          !(await import('./cli/browser.js')).isContainer() &&
          process.stdin.isTTY &&
          process.stdout.isTTY;
        if (canStartHere) {
          const { promptConfirm } = await import('./cli/tui.js');
          const startNow = await promptConfirm(
            t('Start JamRelay now in the background?'),
            t('yes'),
            t('no'),
            true,
          );
          if (startNow) {
            const { startInBackground, readBackgroundLogTail } =
              await import('./runtime/background.js');
            const started = await startInBackground();
            const details = `${t('Process ID')}: ${started.pid ?? '?'}\n${t('Log file')}: ${started.log}`;
            postTuiMessage = started.healthy
              ? `${t('JamRelay is running in the background.')}\n${details}\n\n${t('Open the management menu with jamrelay onboard. To stop the server, end the process shown above in Task Manager or with kill.')}`
              : `${t('JamRelay did not start. Check the log file below.')}\n${details}\n\n${readBackgroundLogTail(started.log)}`;
            postTuiIsError = !started.healthy;
            return 0;
          }
        }
        postTuiMessage = t(
          configured === false
            ? 'To finish Docker Compose setup, from the directory containing compose.yml run: docker compose run --rm -it jamrelay setup'
            : configured === 'locked'
              ? 'No configuration was changed because JamRelay is still running or setup is active.'
              : 'Setup is complete. Run jamrelay start to launch the server, then jamrelay onboard to configure network access and open the management menu.',
        );
        postTuiIsError = false;
      }
      return 0;
    }
    if (command === 'onboard') {
      if (rest.length) {
        console.error(help);
        return 2;
      }
      await (await import('./cli/guided.js')).onboard();
      return 0;
    }
    if (command === 'connectivity') {
      if (rest.some((arg) => arg !== '--json')) {
        console.error(help);
        return 2;
      }
      const connectivity = await import('./cli/connectivity.js');
      if (rest.includes('--json')) return await connectivity.showConnectivityStatus(true);
      await connectivity.configureConnectivity();
      return 0;
    }
    if (command === 'connect') {
      const [kind, name, ...extra] = rest;
      if (
        !['provider', 'client'].includes(kind) ||
        !name ||
        extra.some((arg) => kind !== 'client' || arg !== '--verify')
      ) {
        console.error(knownMessage('connect provider|client NAME'));
        return 2;
      }
      const verified = await (
        await import('./cli/guided.js')
      ).guidedConnect(
        kind as 'provider' | 'client',
        name.toLowerCase(),
        extra.includes('--verify'),
      );
      return extra.includes('--verify') && verified !== true ? 1 : 0;
    }
    if (
      ![
        'start',
        'doctor',
        'status',
        'connections',
        'clients',
        'jobs',
        'diagnostics',
        'backup',
      ].includes(command)
    ) {
      const t = translator(currentLanguage());
      console.error(
        t('Unknown command: {0}. Run jamrelay --help to see available commands.', command),
      );
      return 2;
    }
    let paths = loadInstallation();
    if (command === 'doctor') {
      if (rest.some((s) => s !== '--json')) {
        console.error(help);
        return 2;
      }
      const code = await (await import('./runtime/setup.js')).doctor(rest.includes('--json'));
      if (code === 0) await (await import('./cli/information.js')).passiveHint(args);
      return code;
    }
    if (command === 'start') {
      if (rest.length) {
        console.error(help);
        return 2;
      }
      if (!isInstallationConfigured(paths.config)) {
        if (
          !process.stdin.isTTY ||
          !process.stdout.isTTY ||
          process.env.JAMRELAY_INSTALL_MODE === 'docker'
        )
          throw new Error(
            'JamRelay has not been set up. Run `jamrelay setup` first (Docker Compose: `docker compose run --rm -it jamrelay setup`).',
          );
        const configured = await (await import('./runtime/setup.js')).setup();
        if (configured !== undefined)
          throw new Error(
            'Finish JamRelay setup before starting the server. For Docker Compose, run `docker compose run --rm -it jamrelay setup`.',
          );
        paths = loadInstallation();
        if (!isInstallationConfigured(paths.config))
          throw new Error('Setup did not save the required server security settings.');
      }
      const unlock = await lockInstallation(paths.config);
      process.once('exit', unlock);
      try {
        if (
          process.stdin.isTTY &&
          process.stdout.isTTY &&
          !args.includes('--json') &&
          !args.includes('--yes')
        ) {
          const config = (await import('./config.js')).getConfig();
          const pino = (await import('pino')).default;
          const t = translator(currentLanguage());
          const logLines: string[] = [];
          let serverReady = false;
          const logStream = new Writable({
            write(chunk, _encoding, callback) {
              try {
                const record = JSON.parse(String(chunk)) as { level?: number; msg?: string };
                if (record.msg) logLines.push(record.msg);
                if (logLines.length > 8) logLines.shift();
                showPanel(
                  t(serverReady ? 'JamRelay server is running' : 'Starting JamRelay'),
                  `${t('Keep this terminal open. Press Ctrl+C to stop JamRelay.')}${logLines.length ? `\n\n${logLines.join('\n')}` : ''}`,
                );
              } catch {
                // Ignore malformed log records instead of breaking server startup.
              }
              callback();
            },
          });
          const logger = pino({ level: config.LOG_LEVEL }, logStream);
          showPanel(t('Starting JamRelay'), t('Starting JamRelay server…'));
          const server = await (await import('./index.js')).startServer(config, logger);
          const configurationWatcher = watchConfigurationRequests(paths.config);
          serverReady = true;
          showPanel(
            t('JamRelay server is running'),
            `${t('Keep this terminal open. Press Ctrl+C to stop JamRelay.')}${logLines.length ? `\n\n${logLines.join('\n')}` : ''}`,
          );
          await new Promise<void>((resolve) => server.once('close', resolve));
          configurationWatcher.stop();
          showPanel(t('JamRelay server stopped'), t('JamRelay server stopped'));
          process.off('exit', unlock);
          unlock();
          if (!configurationWatcher.isRestarting())
            await waitForEnter(t('Press Enter to return to the terminal'));
        } else {
          const server = await (await import('./index.js')).startServer();
          watchConfigurationRequests(paths.config);
        }
      } catch (error) {
        unlock();
        throw error;
      }
      return 0;
    }
    const code = await (await import('./operator.js')).runOperator(args);
    if (command === 'status' && code === 0)
      await (await import('./cli/information.js')).passiveHint(args);
    return code;
  } catch (error) {
    if (error instanceof Error && error.message === 'Setup cancelled.') return 130;
    const language = args.includes('--json') ? 'en' : errorLanguage(error);
    const t = translator(language);
    // Never print validator input, env values, provider responses or stacks.
    const safe =
      error instanceof Error &&
      /^(JamRelay is running|JamRelay has not been set up|JamRelay setup is incomplete|Finish JamRelay setup|Setup did not save|Setup cancelled|Interactive setup requires|Run jamrelay setup|Existing encrypted credentials|Configured port is occupied|Remote access requires|Public URL must|Owner secret must|Encryption key must|Runtime |Choose local|Unknown provider|Configuration values|JamRelay (did not|restarted|a redémarré|a redemarre|nie |uruchomił)|Settings were saved|No response from the server|The server stopped responding|Ustawienia zapisano|Serwer |Der Server|Keine Antwort vom Server|Einstellungen gespeichert|JamRelay wurde|JamRelay hat|JamRelay a |JamRelay n’a pas|Aucune réponse du serveur|Le serveur|Paramètres enregistrés|El servidor|Ajustes guardados)/.test(
        error.message,
      );
    const reportError = (message: string) => {
      if (process.stdin.isTTY && ['setup', 'config'].includes(args[0])) {
        postTuiMessage = message;
        postTuiIsError = true;
      } else console.error(message);
    };
    if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
      reportError(
        t(
          'Invalid configuration fields: {0}. Run jamrelay config to correct them.',
          error.issues.map((issue: any) => issue.path.join('.')).join(', '),
        ),
      );
      return 1;
    }
    reportError(
      safe
        ? knownMessage(error.message, language)
        : t(
            'JamRelay failed. Check configuration, provider fields and local file permissions; run jamrelay doctor.',
          ),
    );
    return 1;
  }
}
// This module is the executable; no server is imported until `start` is selected.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1]))
  process.exitCode = await runCli(process.argv.slice(2));
