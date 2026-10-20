import { isIP } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { isLoopbackHttp } from './network-context.js';
const execute = promisify(execFile);
export function isContainer() {
  return (
    process.env.JAMRELAY_INSTALL_MODE === 'docker' ||
    existsSync('/.dockerenv') ||
    existsSync('/run/.containerenv')
  );
}
/** Always print a fallback at the call site. Never launch a browser inside a server/container. */
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
  if (
    isContainer() ||
    !process.stdin.isTTY ||
    process.env.CI ||
    process.env.JAMRELAY_HEADLESS === 'true'
  )
    return false;
  try {
    const command =
      process.platform === 'win32'
        ? 'rundll32.exe'
        : process.platform === 'darwin'
          ? 'open'
          : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', value] : [value];
    await execute(command, args, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
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
