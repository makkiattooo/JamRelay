import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localBaseUrl } from '../config.js';
import { installationPaths, readSettings } from './installation.js';

export type BackgroundStart = {
  pid: number | undefined;
  healthy: boolean;
  log: string;
};

/**
 * Starts `jamrelay start --yes` as a detached process. Its output goes to a log file
 * because there is no terminal left to attach to; health is polled before reporting success.
 */
export async function startInBackground(timeoutMs = 30_000): Promise<BackgroundStart> {
  const paths = installationPaths();
  mkdirSync(paths.data, { recursive: true, mode: 0o700 });
  const log = join(paths.data, 'jamrelay-server.log');
  const output = openSync(log, 'a', 0o600);
  let exited = false;
  try {
    const child = spawn(process.execPath, [process.argv[1], 'start', '--yes'], {
      detached: true,
      stdio: ['ignore', output, output],
      windowsHide: true,
      env: process.env,
    });
    child.on('exit', () => {
      exited = true;
    });
    child.on('error', () => {
      exited = true;
    });
    child.unref();
    const health = new URL(
      '/health',
      localBaseUrl({ ...readSettings(paths.config), ...process.env }),
    );
    const deadline = Date.now() + timeoutMs;
    while (!exited && Date.now() < deadline) {
      try {
        const response = await fetch(health, { signal: AbortSignal.timeout(2000) });
        if (response.status === 200) return { pid: child.pid, healthy: true, log };
      } catch {
        // Not listening yet; keep polling until the deadline or until the child exits.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return { pid: child.pid, healthy: false, log };
  } finally {
    closeSync(output);
  }
}

export function readBackgroundLogTail(log: string, lines = 12) {
  try {
    return readFileSync(log, 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}
