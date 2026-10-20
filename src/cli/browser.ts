import { isIP } from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isLoopbackHttp } from './network-context.js';
export function isContainer() {
  return existsSync('/.dockerenv') || existsSync('/run/.containerenv');
}
/** Launch a browser only from an interactive CLI; headless services keep the printed URL fallback. */
export async function openBrowser(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || (url.protocol !== 'https:' && !isLoopbackHttp(url.origin)))
    return false;
  if (
    [...url.searchParams.keys()].some((key) =>
      /password|secret|access_token|refresh_token/i.test(key),
    )
  )
    return false;
  if (!process.stdin.isTTY || process.env.CI || process.env.JAMRELAY_HEADLESS === 'true')
    return false;
  // A browser spawned inside Docker is not the user's host browser. Let the TUI
  // render a clickable URL instead of waiting for a doomed xdg-open attempt.
  if (isContainer()) return false;
  const command =
    process.platform === 'win32'
      ? 'rundll32.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', value] : [value];
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (opened: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(opened);
    };
    const child = spawn(command, args, {
      detached: process.platform === 'win32',
      stdio: 'ignore',
      windowsHide: true,
    });
    const timeout = setTimeout(() => {
      child.kill();
      finish(false);
    }, 5000);
    child.once('error', () => finish(false));
    child.once('spawn', () => {
      if (process.platform === 'win32') {
        child.unref();
        finish(true);
      } else {
        child.once('close', (code) => finish(code === 0));
      }
    });
  });
}

/** Copy public setup values when a host clipboard command is available. */
export async function copyToClipboard(value: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  if (isContainer()) {
    // OSC 52 is forwarded by VS Code's integrated terminal, so Dockerized TUI
    // commands can copy to the host clipboard without mounting host binaries.
    process.stdout.write(`\u001b]52;c;${Buffer.from(value).toString('base64')}\u0007`);
    return true;
  }
  const candidates =
    process.platform === 'win32'
      ? [['clip.exe', []]]
      : process.platform === 'darwin'
        ? [['pbcopy', []]]
        : [
            ['wl-copy', []],
            ['xclip', ['-selection', 'clipboard']],
            ['xsel', ['--clipboard', '--input']],
          ];
  for (const [command, args] of candidates as [string, string[]][]) {
    const copied = await new Promise<boolean>((resolve) => {
      const child = spawn(command, args, {
        stdio: ['pipe', 'ignore', 'ignore'],
        windowsHide: true,
      });
      const timeout = setTimeout(() => child.kill(), 2000);
      child.once('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        resolve(code === 0);
      });
      child.stdin.end(value);
    });
    if (copied) return true;
  }
  return false;
}

/** Reject obviously private origins; actual public reachability still needs a remote check. */
export function publicHttpsEndpoint(value: string) {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (
    /^(localhost|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(
      host,
    ) ||
    /\.(localhost|local|internal|home|test|invalid|example|arpa)$/.test(host)
  )
    return false;
  if (isIP(host) === 6) return !/^(::|fc|fd|fe[89ab])/i.test(host);
  return host.includes('.');
}
