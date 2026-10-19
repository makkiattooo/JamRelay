import { randomBytes } from 'node:crypto';
import { existsSync, accessSync, constants, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, isAbsolute, join } from 'node:path';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { getConfig } from '../config.js';
import {
  currentLanguage,
  translator,
  knownMessage,
  languages,
  languageMenu,
  languagePrompt,
  selectLanguage,
  yesNo,
  rememberErrorLanguage,
} from '../cli/i18n/index.js';
import { initializeDatabase, closeDatabase, checksumMigration } from '../db/database.js';
import {
  installationPaths,
  readSettings,
  saveSettings,
  lockInstallation,
  runtimePath,
} from './installation.js';

export const supportedNode = () => {
  const [major, minor] = process.versions.node.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 13);
};
export function validateSettings(settings: Record<string, string>) {
  const config = getConfig(settings);
  const url = new URL(config.PUBLIC_BASE_URL);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Public URL must be an origin without credentials, path, query or fragment.');
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error('Remote access requires an HTTPS public URL.');
  if (!config.MCP_OAUTH_OWNER_SECRET || config.MCP_OAUTH_OWNER_SECRET.length < 32)
    throw new Error(
      'Owner secret must contain at least 32 characters. Existing short secrets must be updated explicitly.',
    );
  if (
    !config.TOKEN_ENCRYPTION_KEY ||
    Buffer.from(config.TOKEN_ENCRYPTION_KEY, 'base64').length !== 32
  )
    throw new Error('Encryption key must encode exactly 32 bytes in base64.');
  for (const key of [
    'JAMRELAY_DATA_DIR',
    'JAMRELAY_DB_PATH',
    'PROVIDER_CREDENTIAL_STORE_PATH',
    'MCP_OAUTH_STORE_PATH',
    'MCP_OAUTH_CLIENTS_PATH',
  ]) {
    if (!settings[key] || !isAbsolute(settings[key]))
      throw new Error(`${key} must be an absolute path.`);
  }
  if (config.APPLE_MUSIC_PRIVATE_KEY_PATH)
    accessSync(config.APPLE_MUSIC_PRIVATE_KEY_PATH, constants.R_OK);
  return config;
}
export async function portOccupied(host: string, port: number) {
  return new Promise<boolean>((resolve, reject) => {
    const server = createServer();
    server.once('error', (error: NodeJS.ErrnoException) =>
      error.code === 'EADDRINUSE'
        ? resolve(true)
        : reject(new Error('Cannot bind configured address/port.')),
    );
    server.listen(port, host, () => server.close(() => resolve(false)));
  });
}
function writable(path: string) {
  let parent = existsSync(path) ? path : dirname(path);
  while (!existsSync(parent)) parent = dirname(parent);
  accessSync(parent, constants.W_OK);
}
function assets() {
  if (!existsSync(runtimePath('assets', 'brand')))
    throw new Error('Runtime assets are missing; reinstall the package.');
  if (!readdirSync(runtimePath('db', 'migrations')).includes('0012_durable_queue.sql'))
    throw new Error('Runtime migration 0012 is missing; reinstall the package.');
}
function hiddenQuestion(label: string, hiddenLabel: string): Promise<string> {
  process.stdout.write(`${label} (${hiddenLabel}): `);
  emitKeypressEvents(process.stdin);
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const done = () => {
      process.stdin.off('keypress', onKey);
      process.stdin.off('end', cancelled);
      process.stdin.off('error', cancelled);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const cancelled = () => {
      done();
      reject(new Error('Setup cancelled.'));
    };
    const onKey = (text: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
        cancelled();
      } else if (key.name === 'return' || key.name === 'enter') {
        done();
        resolve(value);
      } else if (key.name === 'backspace') value = value.slice(0, -1);
      else if (text && !key.ctrl) value += text;
    };
    process.stdin.on('keypress', onKey);
    process.stdin.once('end', cancelled);
    process.stdin.once('error', cancelled);
  });
}
export async function setup(nonInteractive = false) {
  let language = currentLanguage();
  let t = translator(language);
  if (!supportedNode()) throw new Error('Node.js >=22.13.0 is required.');
  if (!nonInteractive && !process.stdin.isTTY)
    throw new Error(
      'Interactive setup requires a terminal. For automation use setup --yes with environment variables.',
    );
  assets();
  const paths = installationPaths();
  let unlock = () => {};
  let terminal: ReturnType<typeof createInterface> | undefined;
  let inputAbort: AbortController;
  const ask = async (label: string, fallback: string) => {
    if (!terminal) {
      inputAbort = new AbortController();
      terminal = createInterface({ input: process.stdin, output: process.stdout });
      terminal.once('SIGINT', () => inputAbort.abort());
      terminal.once('close', () => inputAbort.abort());
    }
    try {
      return (
        (
          await terminal.question(`${label} [${fallback}]: `, { signal: inputAbort.signal })
        ).trim() || fallback
      );
    } catch {
      throw new Error('Setup cancelled.');
    }
  };
  const secret = async (label: string, fallback: string | undefined) => {
    terminal?.close();
    terminal = undefined;
    const value = await hiddenQuestion(label, t('hidden; Enter keeps existing'));
    return value || fallback || '';
  };
  try {
    if (!nonInteractive) {
      console.log(languageMenu);
      let chosen;
      do {
        chosen = selectLanguage(
          await ask(languagePrompt, String(languages.indexOf(language) + 1)),
          language,
        );
      } while (!chosen);
      language = chosen;
      t = translator(language);
    }
    const confirm = async (label: string, fallback: boolean) => {
      for (;;) {
        const answer = yesNo(
          await ask(`${label} (${t('yes/no')})`, t(fallback ? 'yes' : 'no')),
          language,
        );
        if (answer !== undefined) return answer;
        console.log(t('Please answer yes or no.'));
      }
    };
    const initial = readSettings(paths.config);
    let mode = process.env.JAMRELAY_INSTALL_MODE || initial.JAMRELAY_INSTALL_MODE || 'local';
    if (!nonInteractive) mode = await ask(t('Installation mode (local/docker)'), mode);
    if (!['local', 'docker'].includes(mode))
      throw new Error('Choose local or docker installation mode.');
    if (mode === 'docker' && !existsSync(paths.config) && !process.env.JAMRELAY_CONFIG_PATH)
      paths.config = '/data/jamrelay.env';
    if (!nonInteractive) {
      console.log(
        t(
          'This private env file stores credentials and encryption keys. Keep it outside public/shared directories.',
        ),
      );
      paths.config = resolve(await ask(t('Private configuration file'), paths.config));
    }
    paths.legacy = paths.config === resolve('.env') && existsSync(paths.config);
    writable(paths.config);
    unlock = await lockInstallation(paths.config);
    const saved = readSettings(paths.config);
    // Persist existing env overrides as well, using the same config keys as the runtime.
    if (
      saved.TOKEN_ENCRYPTION_KEY &&
      process.env.TOKEN_ENCRYPTION_KEY &&
      saved.TOKEN_ENCRYPTION_KEY !== process.env.TOKEN_ENCRYPTION_KEY
    )
      throw new Error(
        'Existing encrypted credentials: configured key differs from environment; resolve the conflict without rotating the key.',
      );
    const settings: Record<string, string> = { ...saved };
    settings.JAMRELAY_LANGUAGE = language;
    for (const [key, value] of Object.entries(process.env))
      if (
        value !== undefined &&
        /^(SPOTIFY_|SOUNDCLOUD_|APPLE_MUSIC_|YOUTUBE_|TOKEN_ENCRYPTION_KEY$|PROVIDER_CREDENTIAL_STORE_PATH$|MCP_|JAMRELAY_(DATA_DIR|DB_PATH|TOOLSET|INSTALL_MODE)$|HOST$|PORT$|PUBLIC_BASE_URL$|TRUST_PROXY$|LOG_LEVEL$|ALTERNATE_TRACK_RESOLVER_)/.test(
          key,
        )
      )
        settings[key] = value;
    console.log(
      `JamRelay ${t(existsSync(paths.config) ? 'Reconfiguration' : 'Setup')} — ${process.platform}, Node ${process.versions.node}\n${t('Configuration')}: ${paths.config}`,
    );
    settings.JAMRELAY_INSTALL_MODE = mode;
    const legacyProduction = paths.legacy && process.env.NODE_ENV === 'production';
    settings.JAMRELAY_DATA_DIR ||=
      settings.JAMRELAY_INSTALL_MODE === 'docker' ? '/data' : paths.data;
    if (!nonInteractive)
      settings.JAMRELAY_DATA_DIR = await ask(
        t('Data directory (existing data is never moved)'),
        settings.JAMRELAY_DATA_DIR,
      );
    settings.JAMRELAY_DATA_DIR = resolve(settings.JAMRELAY_DATA_DIR);
    const data = settings.JAMRELAY_DATA_DIR;
    settings.JAMRELAY_DB_PATH = resolve(settings.JAMRELAY_DB_PATH || join(data, 'jamrelay.db'));
    const credentialDir = legacyProduction ? '/data' : data;
    for (const [key, file] of Object.entries({
      PROVIDER_CREDENTIAL_STORE_PATH: 'provider-credentials.json',
      MCP_OAUTH_STORE_PATH: 'mcp-oauth.json',
      MCP_OAUTH_CLIENTS_PATH: 'mcp-oauth-clients.json',
    }))
      settings[key] = resolve(settings[key] || join(credentialDir, file));
    // Never manufacture a new key for existing encrypted credentials.
    if (!settings.TOKEN_ENCRYPTION_KEY && existsSync(settings.PROVIDER_CREDENTIAL_STORE_PATH))
      throw new Error(
        'Existing encrypted credentials found without their key. Restore TOKEN_ENCRYPTION_KEY from your private backup.',
      );
    settings.TOKEN_ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
    settings.MCP_OAUTH_OWNER_SECRET ||= randomBytes(32).toString('base64url');
    settings.HOST ||= settings.JAMRELAY_INSTALL_MODE === 'docker' ? '0.0.0.0' : '127.0.0.1';
    settings.PORT ||= '5267';
    if (!nonInteractive) {
      console.log(
        t(
          'Bind address selects local interfaces: 127.0.0.1 is local only; 0.0.0.0 listens on all IPv4 interfaces (usual inside Docker).',
        ),
      );
      settings.HOST = await ask(t('Bind address'), settings.HOST);
      settings.PORT = await ask(t('Port'), settings.PORT);
    }
    settings.PUBLIC_BASE_URL ||= `http://localhost:${settings.PORT}`;
    console.log(
      t(
        'Local HTTP needs no domain. Remote MCP needs a reachable HTTPS origin and a reverse proxy; setup does not expose the server.',
      ),
    );
    if (!nonInteractive) {
      console.log(
        t(
          'Public base URL is the origin clients reach, without a path. A reverse proxy forwards HTTPS to JamRelay; do not enable trust on a directly exposed server.',
        ),
      );
      settings.PUBLIC_BASE_URL = await ask(t('Public base URL'), settings.PUBLIC_BASE_URL);
      settings.TRUST_PROXY = await ask(
        t(
          'Trust reverse proxy (false or true; true trusts every proxy, use only behind a controlled reverse proxy)',
        ),
        settings.TRUST_PROXY || 'false',
      );
      if (await confirm(t('Update owner login secret?'), false))
        settings.MCP_OAUTH_OWNER_SECRET = await secret(
          t('New owner secret (minimum 32 characters)'),
          settings.MCP_OAUTH_OWNER_SECRET,
        );
    }
    const origin = settings.PUBLIC_BASE_URL.replace(/\/$/, '');
    const providers = ['spotify', 'soundcloud', 'apple-music', 'youtube'];
    const selected = nonInteractive
      ? []
      : (
          await ask(
            t('Providers to configure (comma-separated; none skips and preserves existing)'),
            'none',
          )
        )
          .toLowerCase()
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== 'none');
    if (selected.some((p) => !providers.includes(p)))
      throw new Error('Unknown provider; use spotify, soundcloud, apple-music or youtube.');
    for (const provider of selected) {
      if (provider === 'apple-music') {
        console.log(
          t(
            'Apple Developer: create a MusicKit key. Keep its .p8 file at a persistent readable local path (inside /data for Docker). User authorization still requires a MusicKit user token.',
          ),
        );
        for (const key of [
          'APPLE_MUSIC_TEAM_ID',
          'APPLE_MUSIC_KEY_ID',
          'APPLE_MUSIC_PRIVATE_KEY_PATH',
        ])
          settings[key] = await ask(key, settings[key] || '');
        settings.APPLE_MUSIC_PRIVATE_KEY_PATH = resolve(settings.APPLE_MUSIC_PRIVATE_KEY_PATH);
      } else {
        const prefix = provider === 'soundcloud' ? 'SOUNDCLOUD' : provider.toUpperCase();
        console.log(
          t(
            '{0}: obtain an OAuth client ID/secret in the provider developer console. JamRelay cannot create them for you.',
            provider,
          ),
        );
        if (provider === 'youtube')
          console.log(t('Enable YouTube Data API v3 in the developer console.'));
        settings[`${prefix}_CLIENT_ID`] = await ask(
          t('{0} client ID', provider),
          settings[`${prefix}_CLIENT_ID`] || '',
        );
        settings[`${prefix}_CLIENT_SECRET`] = await secret(
          t('{0} client secret', provider),
          settings[`${prefix}_CLIENT_SECRET`],
        );
        settings[`${prefix}_REDIRECT_URI`] = `${origin}/auth/providers/${provider}/callback`;
        console.log(t('Register redirect URI: {0}', settings[`${prefix}_REDIRECT_URI`]));
      }
    }
    for (const provider of ['spotify', 'soundcloud', 'youtube']) {
      const key = `${provider.toUpperCase()}_REDIRECT_URI`;
      if (settings[key] && new URL(settings[key]).origin !== new URL(origin).origin) {
        console.log(
          t(
            'Warning: {0} redirect origin differs from public URL. Register and configure the matching redirect URI before authorization.',
            provider,
          ),
        );
      }
    }
    // Keep existing callback routes unless the operator explicitly selected that provider above.
    const config = validateSettings(settings);
    for (const path of [
      data,
      dirname(settings.JAMRELAY_DB_PATH),
      dirname(settings.PROVIDER_CREDENTIAL_STORE_PATH),
      dirname(settings.MCP_OAUTH_STORE_PATH),
      dirname(settings.MCP_OAUTH_CLIENTS_PATH),
    ]) {
      writable(path);
      mkdirSync(path, { recursive: true, mode: 0o700 });
    }
    if (await portOccupied(config.HOST, config.PORT))
      throw new Error('Configured port is occupied. Stop the existing server before setup.');
    initializeDatabase({ dbPath: settings.JAMRELAY_DB_PATH, dataDir: data });
    closeDatabase();
    saveSettings(paths.config, settings);
    if (!nonInteractive) {
      const { readState, changeState } = await import('../cli/state.js');
      console.log(
        '\n' +
          t(
            'JamRelay updates: optional occasional public HTTPS checks for official releases and project notices. No credentials, installation IDs or telemetry are sent. Disable later with jamrelay notifications disable.',
          ),
      );
      const enabled = await confirm(
        t('Enable occasional CLI update/notice checks?'),
        readState().notifications !== false,
      );
      // Follow a custom configuration path selected in this wizard without touching OAuth settings.
      const priorConfig = process.env.JAMRELAY_CONFIG_PATH;
      process.env.JAMRELAY_CONFIG_PATH = paths.config;
      try {
        await changeState((s) => {
          s.notifications = enabled;
        });
      } finally {
        if (priorConfig === undefined) delete process.env.JAMRELAY_CONFIG_PATH;
        else process.env.JAMRELAY_CONFIG_PATH = priorConfig;
      }
    }
    const configured = providers.filter((p) =>
      Boolean(
        settings[p === 'apple-music' ? 'APPLE_MUSIC_TEAM_ID' : `${p.toUpperCase()}_CLIENT_ID`],
      ),
    );
    console.log(
      `\n${t('JamRelay Setup Complete')}\n\n${t('Configuration')}: ${paths.config}\n${t('Database')}: ${settings.JAMRELAY_DB_PATH}\n${t('MCP endpoint')}: ${origin}/mcp\n${t('Providers')}: ${configured.length ? configured.join(', ') + ' (' + t('configured; run connections list to check account authorization') + ')' : t('none')}\n\n${t('Next')}:\n  jamrelay start\n  jamrelay doctor\n\n${t('Owner login')}: ${origin}/owner/login\n${t('Provider authorization')}: ${origin}/auth/providers/PROVIDER/start\n${t('Use the owner secret from your private configuration at login. Back up that configuration separately: it contains your encryption key and owner secret. Keep it private.')}\n${t('Add {0}/mcp to your remote MCP client, complete owner OAuth consent, then request tools/list to verify the connection.', origin)}`,
    );
  } catch (error) {
    rememberErrorLanguage(error, language);
    throw error;
  } finally {
    terminal?.close();
    closeDatabase();
    unlock();
  }
}
export async function doctor(json = false) {
  const paths = installationPaths();
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!supportedNode()) errors.push('Node.js >=22.13.0 is required.');
  if (!existsSync(paths.config))
    warnings.push(
      'No saved configuration; run jamrelay setup (environment-only deployments are supported).',
    );
  try {
    assets();
  } catch {
    errors.push('Runtime assets/migrations missing; reinstall the package.');
  }
  try {
    const settings = Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    );
    const config = validateSettings(settings);
    writable(paths.config);
    writable(settings.JAMRELAY_DATA_DIR);
    writable(settings.JAMRELAY_DB_PATH);
    for (const key of [
      'PROVIDER_CREDENTIAL_STORE_PATH',
      'MCP_OAUTH_STORE_PATH',
      'MCP_OAUTH_CLIENTS_PATH',
    ])
      writable(settings[key]);
    if (await portOccupied(config.HOST, config.PORT))
      warnings.push(
        'Port is occupied (expected if JamRelay is running); check jamrelay status and /health.',
      );
    if (new URL(config.PUBLIC_BASE_URL).protocol === 'https:' && config.TRUST_PROXY === 'false')
      warnings.push(
        'HTTPS origin: configure TRUST_PROXY for your trusted reverse proxy if TLS terminates there.',
      );
    if (existsSync(settings.JAMRELAY_DB_PATH)) {
      const db = new DatabaseSync(settings.JAMRELAY_DB_PATH, { readOnly: true });
      try {
        if (db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok')
          errors.push('SQLite integrity check failed.');
        const applied = db
          .prepare('SELECT version, checksum FROM schema_migrations ORDER BY version')
          .all();
        for (const row of applied) {
          const path = runtimePath('db', 'migrations', String(row.version));
          if (!existsSync(path) || checksumMigration(readFileSync(path, 'utf8')) !== row.checksum)
            errors.push(`Applied migration mismatch: ${row.version}`);
        }
        const latest = readdirSync(runtimePath('db', 'migrations'))
          .filter((s) => s.endsWith('.sql'))
          .sort()
          .at(-1);
        if (applied.at(-1)?.version !== latest)
          warnings.push('Database migrations pending; start JamRelay to apply them.');
      } finally {
        db.close();
      }
    } else warnings.push('Database not initialized; run jamrelay setup.');
    for (const key of [
      'SPOTIFY_CLIENT_ID',
      'SOUNDCLOUD_CLIENT_ID',
      'APPLE_MUSIC_TEAM_ID',
      'YOUTUBE_CLIENT_ID',
    ])
      if (!settings[key])
        warnings.push(`${key.split('_CLIENT_ID')[0]} optional provider is not configured.`);
  } catch (error) {
    // Zod/OS errors can contain input values; never serialize them.
    errors.push(
      error instanceof Error && error.message.startsWith('Owner secret')
        ? error.message
        : 'Configuration/path/database validation failed. Check owner secret, encryption key, absolute storage paths, provider fields, public URL and file permissions.',
    );
  }
  const result = JSON.stringify(
    { configuration: paths.config, errors, warnings, ok: errors.length === 0 },
    null,
    2,
  );
  const t = translator(currentLanguage());
  console.log(
    json
      ? result
      : `${t('Configuration')}: ${paths.config}\n${t('Errors')}:\n${errors.map((e) => '  ' + knownMessage(e)).join('\n') || '  0'}\n${t('Warnings')}:\n${warnings.map((e) => '  ' + knownMessage(e)).join('\n') || '  0'}\n${t('State')}: ${errors.length ? t('Errors') : t('OK')}`,
  );
  return errors.length ? 1 : 0;
}
