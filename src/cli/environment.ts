import { execFile } from 'node:child_process';
import { isContainer } from './browser.js';

/** Runs a host command and resolves to its trimmed stdout, or undefined when it fails or times out. */
function run(command: string, args: string[]) {
  return new Promise<string | undefined>((resolve) => {
    execFile(command, args, { timeout: 5000, windowsHide: true }, (error, stdout) =>
      resolve(error ? undefined : stdout.trim()),
    );
  });
}

export type HostEnvironment = {
  /** The CLI runs inside a container, so it cannot inspect or change the host's Docker. */
  insideContainer: boolean;
  docker: boolean;
  dockerConnector?: string;
  jamrelayContainer?: string;
  jamrelayNetwork?: string;
  hostCloudflared: boolean;
  node: string | undefined;
};

/** Detects where JamRelay runs and which connector tools are available, without changing anything. */
export async function detectEnvironment(): Promise<HostEnvironment> {
  const insideContainer = isContainer();
  const node = await run(process.execPath, ['--version']);
  if (insideContainer) return { insideContainer, docker: false, hostCloudflared: false, node };
  const docker = Boolean(await run('docker', ['version', '--format', '{{.Server.Version}}']));
  const hostCloudflared = Boolean(await run('cloudflared', ['--version']));
  if (!docker) return { insideContainer, docker, hostCloudflared, node };
  const connector = (
    await run('docker', [
      'ps',
      '--filter',
      'ancestor=cloudflare/cloudflared',
      '--format',
      '{{.Names}}',
    ])
  )
    ?.split('\n')[0]
    ?.trim();
  const jamrelay = (
    await run('docker', ['ps', '--filter', 'ancestor=jamrelay:local', '--format', '{{.Names}}'])
  )
    ?.split('\n')[0]
    ?.trim();
  const networks = jamrelay
    ? (
        await run('docker', [
          'inspect',
          '-f',
          '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}',
          jamrelay,
        ])
      )
        ?.split(' ')
        .filter(Boolean)
    : undefined;
  return {
    insideContainer,
    docker,
    dockerConnector: connector || undefined,
    jamrelayContainer: jamrelay || undefined,
    jamrelayNetwork: networks?.[0],
    hostCloudflared,
    node,
  };
}

/**
 * Attaches a Docker cloudflared connector to the JamRelay network, so its route can use the
 * service name `jamrelay` instead of 127.0.0.1 (which points at the connector container itself).
 * Returns true when the connector can reach JamRelay by service name.
 */
export async function attachConnectorToNetwork(env: HostEnvironment) {
  if (!env.dockerConnector || !env.jamrelayNetwork) return false;
  // `docker network connect` fails when the container is already attached; that counts as success.
  await run('docker', ['network', 'connect', env.jamrelayNetwork, env.dockerConnector]);
  const attached = await run('docker', [
    'inspect',
    '-f',
    '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}',
    env.dockerConnector,
  ]);
  return Boolean(attached?.split(' ').includes(env.jamrelayNetwork));
}
