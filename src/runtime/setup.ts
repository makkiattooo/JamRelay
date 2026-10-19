import { randomBytes } from 'node:crypto';
import { existsSync, accessSync, constants, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, isAbsolute, join } from 'node:path';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { getConfig } from '../config.js';
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
function hiddenQuestion(label: string): Promise<string> {
  process.stdout.write(`${label} (hidden; Enter keeps existing): `);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const done = () => {
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onKey = (text: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') {
        done();
        reject(new Error('Setup cancelled.'));
      } else if (key.name === 'return' || key.name === 'enter') {
        done();
        resolve(value);
      } else if (key.name === 'backspace') value = value.slice(0, -1);
      else if (text && !key.ctrl) value += text;
    };
    process.stdin.on('keypress', onKey);
  });
}
export async function setup(nonInteractive = false) {
  if (!supportedNode()) throw new Error('Node.js >=22.13.0 is required.');
  if (!nonInteractive && !process.stdin.isTTY)
    throw new Error(
      'Interactive setup requires a terminal. For automation use setup --yes with environment variables.',
    );
  assets();
  const paths = installationPaths();
  let unlock = () => {};
  let terminal: ReturnType<typeof createInterface> | undefined;
  const ask = async (label: string, fallback: string) => {
    terminal ||= createInterface({ input: process.stdin, output: process.stdout });
    return (await terminal.question(`${label} [${fallback}]: `)).trim() || fallback;
  };
  const secret = async (label: string, fallback: string | undefined) => {
    terminal?.close();
    terminal = undefined;
    const value = await hiddenQuestion(label);
    return value || fallback || '';
  };
  try {
    const initial = readSettings(paths.config);
    let mode = process.env.JAMRELAY_INSTALL_MODE || initial.JAMRELAY_INSTALL_MODE || 'local';
    if (!nonInteractive) mode = await ask('Installation mode (local/docker)', mode);
    if (!['local', 'docker'].includes(mode))
      throw new Error('Choose local or docker installation mode.');
    if (mode === 'docker' && !existsSync(paths.config) && !process.env.JAMRELAY_CONFIG_PATH)
      paths.config = '/data/jamrelay.env';
    if (!nonInteractive)
      paths.config = resolve(await ask('Private configuration file', paths.config));
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
    for (const [key, value] of Object.entries(process.env))
      if (
        value !== undefined &&
        /^(SPOTIFY_|SOUNDCLOUD_|APPLE_MUSIC_|YOUTUBE_|TOKEN_ENCRYPTION_KEY$|PROVIDER_CREDENTIAL_STORE_PATH$|MCP_|JAMRELAY_(DATA_DIR|DB_PATH|TOOLSET|INSTALL_MODE)$|HOST$|PORT$|PUBLIC_BASE_URL$|TRUST_PROXY$|LOG_LEVEL$|ALTERNATE_TRACK_RESOLVER_)/.test(
          key,
        )
      )
        settings[key] = value;
    console.log(
      `JamRelay ${existsSync(paths.config) ? 'Reconfiguration' : 'Setup'} — ${process.platform}, Node ${process.versions.node}\nConfiguration: ${paths.config}`,
    );
    settings.JAMRELAY_INSTALL_MODE = mode;
    const legacyProduction = paths.legacy && process.env.NODE_ENV === 'production';
    settings.JAMRELAY_DATA_DIR ||=
      settings.JAMRELAY_INSTALL_MODE === 'docker' ? '/data' : paths.data;
    if (!nonInteractive)
      settings.JAMRELAY_DATA_DIR = await ask(
        'Data directory (existing data is never moved)',
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
      settings.HOST = await ask('Bind address', settings.HOST);
      settings.PORT = await ask('Port', settings.PORT);
    }
    settings.PUBLIC_BASE_URL ||= `http://localhost:${settings.PORT}`;
    console.log(
      'Local HTTP needs no domain. Remote MCP needs a reachable HTTPS origin and a reverse proxy; setup does not expose the server.',
    );
    if (!nonInteractive) {
      settings.PUBLIC_BASE_URL = await ask('Public base URL', settings.PUBLIC_BASE_URL);
      settings.TRUST_PROXY = await ask(
        'Trust reverse proxy (false or explicit hop count/IP; never trust arbitrary proxies)',
        settings.TRUST_PROXY || 'false',
      );
      if ((await ask('Update owner login secret? (yes/no)', 'no')) === 'yes')
        settings.MCP_OAUTH_OWNER_SECRET = await secret(
          'New owner secret (minimum 32 characters)',
          settings.MCP_OAUTH_OWNER_SECRET,
        );
    }
    const origin = settings.PUBLIC_BASE_URL.replace(/\/$/, '');
    const providers = ['spotify', 'soundcloud', 'apple-music', 'youtube'];
    const selected = nonInteractive
      ? []
      : (
          await ask(
            'Providers to configure (comma-separated; none skips and preserves existing)',
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
          'Apple Developer: create a MusicKit key. Keep its .p8 file at a persistent readable local path (inside /data for Docker). User authorization still requires a MusicKit user token.',
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
          `${provider}: obtain an OAuth client ID/secret in the provider developer console${provider === 'youtube' ? ' and enable YouTube Data API v3' : ''}. JamRelay cannot create them for you.`,
        );
        settings[`${prefix}_CLIENT_ID`] = await ask(
          `${provider} client ID`,
          settings[`${prefix}_CLIENT_ID`] || '',
        );
        settings[`${prefix}_CLIENT_SECRET`] = await secret(
          `${provider} client secret`,
          settings[`${prefix}_CLIENT_SECRET`],
        );
        settings[`${prefix}_REDIRECT_URI`] = `${origin}/auth/providers/${provider}/callback`;
        console.log(`Register redirect URI: ${settings[`${prefix}_REDIRECT_URI`]}`);
      }
    }
    for (const provider of ['spotify', 'soundcloud', 'youtube']) {
      const key = `${provider.toUpperCase()}_REDIRECT_URI`;
      if (settings[key] && new URL(settings[key]).origin !== new URL(origin).origin) {
        console.log(
          `Warning: ${provider} redirect origin differs from public URL. Register and configure the matching redirect URI before authorization.`,
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
    const configured = providers.filter((p) =>
      Boolean(
        settings[p === 'apple-music' ? 'APPLE_MUSIC_TEAM_ID' : `${p.toUpperCase()}_CLIENT_ID`],
      ),
    );
    console.log(
      `\nJamRelay Setup Complete\n\nConfiguration: ${paths.config}\nDatabase:      ${settings.JAMRELAY_DB_PATH}\nMCP endpoint:  ${origin}/mcp\nProviders:     ${configured.length ? configured.join(', ') + ' (configured; run connections list to check account authorization)' : 'none'}\n\nNext:\n  jamrelay start\n  jamrelay doctor\n\nOwner login: ${origin}/owner/login\nProvider authorization: ${origin}/auth/providers/PROVIDER/start\nUse the owner secret from your private configuration at login. Back up that configuration separately: it contains your encryption key and owner secret. Keep it private.\nAdd ${origin}/mcp to your remote MCP client, complete owner OAuth consent, then request tools/list to verify the connection.`,
    );
  } finally {
    terminal?.close();
    closeDatabase();
    unlock();
  }
}
export async function doctor() {
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
  console.log(
    JSON.stringify(
      { configuration: paths.config, errors, warnings, ok: errors.length === 0 },
      null,
      2,
    ),
  );
  return errors.length ? 1 : 0;
}
