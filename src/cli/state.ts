import { readFileSync, statSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { installationPaths, lockInstallation } from '../runtime/installation.js';

export const channelSchema = z.enum(['stable', 'beta']);
export const cliStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    channel: channelSchema.default('stable'),
    notifications: z.boolean().nullable().default(null),
    lastPassiveAttempt: z.number().nonnegative().default(0),
    notices: z
      .record(
        z.string().max(100),
        z.object({
          readAt: z.string().datetime().nullable(),
          seenAt: z.string().datetime().nullable().optional(),
          dismissed: z.boolean(),
        }),
      )
      .default({}),
  })
  .strict();
export type CliState = z.infer<typeof cliStateSchema>;
export const defaultState = (): CliState => ({
  schemaVersion: 1,
  channel: 'stable',
  notifications: null,
  lastPassiveAttempt: 0,
  notices: {},
});
export function cliPaths() {
  const paths = installationPaths();
  const home = homedir();
  const cache =
    process.env.JAMRELAY_INSTALL_MODE === 'docker'
      ? join(paths.data, 'cli-cache')
      : process.platform === 'win32'
        ? join(process.env.LOCALAPPDATA || home, 'JamRelay', 'Cache')
        : process.platform === 'darwin'
          ? join(home, 'Library', 'Caches', 'JamRelay')
          : join(process.env.XDG_CACHE_HOME || join(home, '.cache'), 'jamrelay');
  return {
    state: resolve(
      process.env.JAMRELAY_CLI_STATE_PATH || join(dirname(paths.config), 'cli-state.json'),
    ),
    cache: resolve(process.env.JAMRELAY_CACHE_DIR || cache),
  };
}
export function readJson(path: string, limit = 1_048_576): unknown {
  if (statSync(path).size > limit) throw new Error('CLI file too large');
  const data = readFileSync(path);
  if (data.byteLength > limit) throw new Error('CLI file too large');
  return JSON.parse(data.toString('utf8'));
}
export function atomicJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    renameSync(temp, path);
  } finally {
    try {
      unlinkSync(temp);
    } catch {
      /* renamed or never created */
    }
  }
}
export function readState(): CliState {
  try {
    return cliStateSchema.parse(readJson(cliPaths().state));
  } catch {
    return defaultState();
  }
}
export async function changeState(change: (state: CliState) => void) {
  const path = cliPaths().state;
  const release = await lockInstallation(path);
  try {
    const state = readState();
    change(state);
    if (Object.keys(state.notices).length > 2000)
      throw new Error('Too many locally tracked notices');
    atomicJson(path, cliStateSchema.parse(state));
    return state;
  } finally {
    release();
  }
}
export function cacheTtl() {
  const n = Number(process.env.JAMRELAY_CLI_CACHE_TTL_MS);
  return Number.isFinite(n) && n >= 1000 && n <= 30 * 86400000 ? n : 86400000;
}
