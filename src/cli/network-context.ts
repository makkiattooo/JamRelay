import { APP_VERSION } from '../version.js';

/** Client URLs describe the host; probes describe where this process runs. */
export function isLoopbackHttp(origin: string) {
  const url = new URL(origin);
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}
export function probeOrigin(origin: string, env: NodeJS.ProcessEnv = process.env) {
  if (env.JAMRELAY_INSTALL_MODE !== 'docker' || !isLoopbackHttp(origin)) return origin;
  // Compose run starts a second container. 127.0.0.1 is never the host there.
  const internal = new URL(env.JAMRELAY_SERVICE_URL || `http://jamrelay:${env.PORT || '5267'}`);
  if (
    internal.protocol !== 'http:' ||
    internal.username ||
    internal.password ||
    internal.pathname !== '/' ||
    internal.search ||
    internal.hash
  )
    throw new Error('JAMRELAY_SERVICE_URL must be an internal HTTP origin.');
  return internal.origin;
}
export function probeOrigins(origin: string) {
  const primary = probeOrigin(origin);
  return process.env.JAMRELAY_INSTALL_MODE === 'docker' && isLoopbackHttp(origin)
    ? [...new Set([primary, `http://127.0.0.1:${process.env.PORT || '5267'}`])]
    : [primary];
}
export async function probeHealth(origin: string) {
  for (const target of probeOrigins(origin)) {
    try {
      if (await healthyAt(target)) return true;
    } catch {
      /* Try container loopback for docker exec. */
    }
  }
  return false;
}
async function healthyAt(target: string) {
  const response = await fetch(new URL('/health', target), {
    signal: AbortSignal.timeout(2000),
    redirect: 'manual',
  });
  if (!response.ok) return false;
  const body = (await response.json()) as {
    status?: string;
    version?: string;
    database?: { schemaState?: string };
  };
  return (
    body.status === 'ok' && body.version === APP_VERSION && body.database?.schemaState === 'current'
  );
}
