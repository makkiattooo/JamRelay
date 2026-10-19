#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from './version.js';
import { translator, currentLanguage, knownMessage, errorLanguage } from './cli/i18n/index.js';
import { loadInstallation, lockInstallation } from './runtime/installation.js';

export function cliHelp() {
  const t = translator(currentLanguage());
  return `JamRelay — ${t('self-hosted music MCP server')}
${t('Usage')}: jamrelay <command>
  setup [--yes]       ${t('Configure installation (interactive; --yes uses environment)')}
  config             ${t('Safely reconfigure existing installation')}
  start              ${t('Run the MCP HTTP server')}
  status | doctor    ${t('Installation status / configuration diagnostics')}
  connections list
  clients list | clients revoke ID
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
export const help = cliHelp();
export async function runCli(args: string[]) {
  const help = cliHelp();
  const [command, ...rest] = args;
  if (!command || command === '--help' || command === '-h') {
    console.log(help);
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
    if (command === 'setup' || command === 'config') {
      if (rest.some((s) => s !== '--yes')) {
        console.error(help);
        return 2;
      }
      await (await import('./runtime/setup.js')).setup(rest.includes('--yes'));
      return 0;
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
      console.error(help);
      return 2;
    }
    const paths = loadInstallation();
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
      const unlock = await lockInstallation(paths.config);
      process.once('exit', unlock);
      try {
        await (await import('./index.js')).startServer();
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
    const language = args.includes('--json') ? 'en' : errorLanguage(error);
    const t = translator(language);
    // Never print validator input, env values, provider responses or stacks.
    const safe =
      error instanceof Error &&
      /^(JamRelay is running|Setup cancelled|Interactive setup requires|Existing encrypted credentials|Configured port is occupied|Remote access requires|Public URL must|Owner secret must|Encryption key must|Runtime |Choose local|Unknown provider|Configuration values)/.test(
        error.message,
      );
    if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
      console.error(
        t(
          'Invalid configuration fields: {0}. Run jamrelay config to correct them.',
          error.issues.map((issue: any) => issue.path.join('.')).join(', '),
        ),
      );
      return 1;
    }
    console.error(
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
