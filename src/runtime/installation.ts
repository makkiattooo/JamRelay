import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
const lockfile = createRequire(import.meta.url)('proper-lockfile');

export const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
export const runtimePath = (...parts: string[]) => join(packageRoot, ...parts);
export function installationPaths() {
  const home = homedir();
  const docker = process.env.JAMRELAY_INSTALL_MODE === 'docker';
  const base =
    process.platform === 'win32'
      ? join(process.env.APPDATA || home, 'JamRelay')
      : process.platform === 'darwin'
        ? join(home, 'Library', 'Application Support', 'JamRelay')
        : join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'jamrelay');
  const hasDotEnv = existsSync(resolve('.env'));
  const config = resolve(
    process.env.JAMRELAY_CONFIG_PATH ||
      (docker ? '/data/jamrelay.env' : hasDotEnv ? '.env' : join(base, 'jamrelay.env')),
  );
  const legacy = hasDotEnv && config === resolve('.env');
  const data = resolve(
    process.env.JAMRELAY_DATA_DIR ||
      (docker
        ? '/data'
        : legacy
          ? 'data'
          : process.platform === 'linux'
            ? join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), 'jamrelay')
            : join(base, 'data')),
  );
  return { config, data, legacy };
}
export function readSettings(path: string): Record<string, string> {
  return existsSync(path) ? (parseEnv(readFileSync(path, 'utf8')) as Record<string, string>) : {};
}
export function loadInstallation() {
  const paths = installationPaths();
  const saved = readSettings(paths.config);
  for (const [key, value] of Object.entries(saved))
    if (process.env[key] === undefined) process.env[key] = value;
  process.env.JAMRELAY_DATA_DIR ||= paths.data;
  const data = process.env.JAMRELAY_DATA_DIR;
  // Preserve legacy production defaults; managed installations persist all paths explicitly.
  const credentials = paths.legacy && process.env.NODE_ENV === 'production' ? '/data' : data;
  process.env.PROVIDER_CREDENTIAL_STORE_PATH ||= join(credentials, 'provider-credentials.json');
  process.env.MCP_OAUTH_STORE_PATH ||= join(credentials, 'mcp-oauth.json');
  process.env.MCP_OAUTH_CLIENTS_PATH ||= join(credentials, 'mcp-oauth-clients.json');
  process.env.JAMRELAY_DB_PATH ||= join(data, 'jamrelay.db');
  for (const key of [
    'JAMRELAY_DATA_DIR',
    'JAMRELAY_DB_PATH',
    'PROVIDER_CREDENTIAL_STORE_PATH',
    'MCP_OAUTH_STORE_PATH',
    'MCP_OAUTH_CLIENTS_PATH',
  ])
    process.env[key] = resolve(process.env[key]!);
  return paths;
}
export function saveSettings(path: string, settings: Record<string, string>) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Node's env parser supports quoted multiline values; reject quotes to keep serialization unambiguous.
  for (const value of Object.values(settings))
    if (value.includes('"') || value.includes('\0'))
      throw new Error('Configuration values must not contain double quotes or NUL.');
  const temp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(
      temp,
      Object.entries(settings)
        .map(([k, v]) => `${k}="${v}"`)
        .join('\n') + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}
// Heartbeat locks work across container PID namespaces and recover after crashes.
export async function lockInstallation(config: string): Promise<() => void> {
  mkdirSync(dirname(config), { recursive: true, mode: 0o700 });
  try {
    await lockfile.lock(config, { realpath: false, stale: 30_000, update: 5_000, retries: 0 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOCKED')
      throw new Error(
        'JamRelay is running or setup is active. Stop it before reconfiguration; after an unclean exit allow 30 seconds for lock recovery.',
      );
    throw error;
  }
  return () => {
    try {
      lockfile.unlockSync(config, { realpath: false });
    } catch {
      /* already released */
    }
  };
}
