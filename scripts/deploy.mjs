#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  access,
  open,
  readFile,
  stat,
  unlink,
} from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import process from 'node:process';

const APP_ROOT = '/srv/tunelink';
const COMPOSE_FILE = `${APP_ROOT}/compose.yml`;
const APP_ENV_FILE = `${APP_ROOT}/.env`;
const CLOUDFLARE_ENV_FILE = '/etc/tunelink/compose.env';

const APP_CONTAINER = 'tunelink_app';
const TUNNEL_CONTAINER = 'tunelink_tunnel';
const VOLUME_NAME = 'tunelink_data';
const NETWORK_NAME = 'tunelink_internal';

const HEALTH_URL = 'http://127.0.0.1:3010/health';
const LOCK_FILE = '/var/lock/tunelink-deploy.lock';

const PROBE_CONTAINER = 'tunelink_deploy_probe';
const MIGRATOR_CONTAINER = 'tunelink_deploy_migrator';

const REQUIRED_SERVICES = new Set(['app', 'tunnel']);

const PREDECESSOR_APP = optionalExactName(
  'TUNELINK_PREDECESSOR_APP',
);

const PREDECESSOR_TUNNEL = optionalExactName(
  'TUNELINK_PREDECESSOR_TUNNEL',
);

const PREDECESSOR_VOLUME = optionalExactName(
  'TUNELINK_PREDECESSOR_VOLUME',
);

const PREDECESSOR_NETWORK = optionalExactName(
  'TUNELINK_PREDECESSOR_NETWORK',
);

let lockHandle;
let lockOwned = false;
let stage = 'initialization';

let previousImageId = '';
let previousImageRef = '';
let appReplacementStarted = false;

let predecessorAppWasRunning = false;
let predecessorAppWasStopped = false;

let createdVolumeThisRun = false;
let migratedVolumeThisRun = false;
let migrationAccepted = false;

function log(level, message) {
  console.log(`[${level}] ${message}`);
}

const info = (message) => log('INFO', message);
const ok = (message) => log('OK', message);
const warn = (message) => log('WARN', message);

function optionalExactName(envName) {
  const value = process.env[envName]?.trim() ?? '';

  if (!value) {
    return '';
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) {
    throw new Error(
      `${envName} zawiera niedozwoloną nazwę zasobu.`,
    );
  }

  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error) {
  return error instanceof Error
    ? error.message
    : String(error);
}

async function run(
  command,
  args = [],
  {
    cwd,
    input,
    allowFailure = false,
    stream = false,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...(cwd ? { cwd } : {}),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      stdout += chunk;

      if (stream) {
        process.stdout.write(chunk);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;

      if (stream) {
        process.stderr.write(chunk);
      }
    });

    child.on('error', reject);

    child.on('close', (code, signal) => {
      const result = {
        code,
        signal,
        stdout,
        stderr,
      };

      if (code === 0 || allowFailure) {
        resolve(result);
        return;
      }

      const suffix = signal
        ? `signal ${signal}`
        : `exit code ${code ?? 'unknown'}`;

      reject(
        new Error(
          `${command} zakończył się błędem (${suffix}).`,
        ),
      );
    });

    if (input !== undefined) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
  });
}

async function compose(args, options = {}) {
  return run(
    'docker',
    [
      'compose',
      '--env-file',
      CLOUDFLARE_ENV_FILE,
      '-f',
      COMPOSE_FILE,
      ...args,
    ],
    {
      ...options,
      cwd: APP_ROOT,
    },
  );
}

async function commandExists(command) {
  const entries = (process.env.PATH ?? '')
    .split(':')
    .filter(Boolean);

  for (const entry of entries) {
    try {
      await access(
        `${entry}/${command}`,
        fsConstants.X_OK,
      );

      return true;
    } catch {
      // Continue.
    }
  }

  return false;
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function containerExists(name) {
  if (!name) {
    return false;
  }

  const result = await run(
    'docker',
    [
      'container',
      'inspect',
      name,
    ],
    {
      allowFailure: true,
    },
  );

  return result.code === 0;
}

async function containerState(name) {
  if (!name) {
    return '';
  }

  const result = await run(
    'docker',
    [
      'container',
      'inspect',
      '--format',
      '{{.State.Status}}',
      name,
    ],
    {
      allowFailure: true,
    },
  );

  return result.code === 0
    ? result.stdout.trim()
    : '';
}

async function volumeExists(name) {
  if (!name) {
    return false;
  }

  const result = await run(
    'docker',
    [
      'volume',
      'inspect',
      name,
    ],
    {
      allowFailure: true,
    },
  );

  return result.code === 0;
}

async function networkExists(name) {
  if (!name) {
    return false;
  }

  const result = await run(
    'docker',
    [
      'network',
      'inspect',
      name,
    ],
    {
      allowFailure: true,
    },
  );

  return result.code === 0;
}

function parseEnvValue(text, key) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    if (!line.startsWith(`${key}=`)) {
      continue;
    }

    return line
      .slice(key.length + 1)
      .trim();
  }

  return '';
}

function redact(text, secret) {
  if (!secret) {
    return text;
  }

  return text
    .split(secret)
    .join('[REDACTED]');
}

async function acquireLock() {
  stage = 'deployment lock';

  try {
    lockHandle = await open(
      LOCK_FILE,
      fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_WRONLY,
      0o600,
    );
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }

    const existing = await readFile(
      LOCK_FILE,
      'utf8',
    ).catch(() => '');

    const pid = Number(
      existing.match(/^pid=(\d+)$/m)?.[1] ?? 0,
    );

    let active = false;

    if (pid > 0) {
      try {
        process.kill(pid, 0);
        active = true;
      } catch (probeError) {
        active = probeError?.code === 'EPERM';
      }
    }

    if (active) {
      throw new Error(
        `Inny deploy TuneLink jest już uruchomiony (pid ${pid}).`,
      );
    }

    warn(
      'Wykryto nieaktywny lock deployu; usuwam wyłącznie lock TuneLink.',
    );

    await unlink(LOCK_FILE).catch(() => {});

    lockHandle = await open(
      LOCK_FILE,
      fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_WRONLY,
      0o600,
    );
  }

  await lockHandle.writeFile(
    `pid=${process.pid}\ntimestamp=${new Date().toISOString()}\n`,
  );

  lockOwned = true;
}

async function validatePreflight() {
  stage = 'pre-flight validation';

  if (process.platform !== 'linux') {
    throw new Error(
      'Deploy VPS jest obsługiwany wyłącznie na Linuxie.',
    );
  }

  if (process.getuid?.() !== 0) {
    throw new Error(
      'Uruchom deploy jako root, np. sudo npm run deploy:vps.',
    );
  }

  if (!(await commandExists('docker'))) {
    throw new Error('Brak Docker CLI.');
  }

  for (const path of [
    APP_ROOT,
    COMPOSE_FILE,
    APP_ENV_FILE,
    CLOUDFLARE_ENV_FILE,
  ]) {
    if (!(await pathExists(path))) {
      throw new Error(
        `Brak wymaganego pliku lub katalogu: ${path}`,
      );
    }
  }

  const cloudflareStat = await stat(
    CLOUDFLARE_ENV_FILE,
  );

  const mode =
    cloudflareStat.mode & 0o777;

  if (
    cloudflareStat.uid !== 0 ||
    cloudflareStat.gid !== 0 ||
    mode !== 0o600
  ) {
    throw new Error(
      '/etc/tunelink/compose.env musi należeć do root:root i mieć tryb 0600.',
    );
  }

  const cloudflareEnv = await readFile(
    CLOUDFLARE_ENV_FILE,
    'utf8',
  );

  const cloudflareToken = parseEnvValue(
    cloudflareEnv,
    'CLOUDFLARE_TUNNEL_TOKEN',
  );

  if (!cloudflareToken) {
    throw new Error(
      '/etc/tunelink/compose.env nie zawiera niepustego CLOUDFLARE_TUNNEL_TOKEN.',
    );
  }

  const appEnv = await readFile(
    APP_ENV_FILE,
    'utf8',
  );

  if (
    parseEnvValue(
      appEnv,
      'PORT',
    ) !== '3010'
  ) {
    throw new Error(
      '/srv/tunelink/.env musi zawierać PORT=3010.',
    );
  }

  await run(
    'docker',
    ['info'],
  );

  await run(
    'docker',
    [
      'compose',
      'version',
    ],
  );

  ok('Pre-flight zakończony poprawnie.');

  return {
    cloudflareToken,
  };
}

function exactSetEquals(actual, expected) {
  if (actual.size !== expected.size) {
    return false;
  }

  for (const item of expected) {
    if (!actual.has(item)) {
      return false;
    }
  }

  return true;
}

function serviceNetworkNames(service) {
  const networks = service?.networks;

  if (Array.isArray(networks)) {
    return new Set(networks);
  }

  if (
    networks &&
    typeof networks === 'object'
  ) {
    return new Set(
      Object.keys(networks),
    );
  }

  return new Set();
}

async function validateCompose() {
  stage = 'Compose validation';

  info(
    'Waliduję Compose i granicę bezpieczeństwa TuneLink.',
  );

  await compose(['config']);

  const services = new Set(
    (
      await compose([
        'config',
        '--services',
      ])
    ).stdout
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  );

  if (
    !exactSetEquals(
      services,
      REQUIRED_SERVICES,
    )
  ) {
    throw new Error(
      'Compose musi zawierać dokładnie usługi app i tunnel.',
    );
  }

  const rawJson = (
    await compose([
      'config',
      '--format',
      'json',
    ])
  ).stdout;

  let config;

  try {
    config = JSON.parse(rawJson);
  } catch {
    throw new Error(
      'Nie udało się bezpiecznie sparsować docker compose config.',
    );
  }

  const app =
    config.services?.app;

  const tunnel =
    config.services?.tunnel;

  if (
    app?.container_name !== APP_CONTAINER ||
    tunnel?.container_name !== TUNNEL_CONTAINER
  ) {
    throw new Error(
      'Compose musi mapować usługi wyłącznie na tunelink_app i tunelink_tunnel.',
    );
  }

  const networkNames = new Set(
    Object.keys(
      config.networks ?? {},
    ),
  );

  if (
    !exactSetEquals(
      networkNames,
      new Set([NETWORK_NAME]),
    )
  ) {
    throw new Error(
      'Compose może definiować wyłącznie sieć tunelink_internal.',
    );
  }

  for (const [serviceName, service] of [
    ['app', app],
    ['tunnel', tunnel],
  ]) {
    const attached =
      serviceNetworkNames(service);

    if (
      !exactSetEquals(
        attached,
        new Set([NETWORK_NAME]),
      )
    ) {
      throw new Error(
        `Usługa ${serviceName} może być podłączona wyłącznie do tunelink_internal.`,
      );
    }
  }

  const volumeNames = new Set(
    Object.keys(
      config.volumes ?? {},
    ),
  );

  if (
    !exactSetEquals(
      volumeNames,
      new Set([VOLUME_NAME]),
    )
  ) {
    throw new Error(
      'Compose może definiować wyłącznie volume tunelink_data.',
    );
  }

  const volume =
    config.volumes?.[VOLUME_NAME];

  if (
    volume?.external !== true ||
    volume?.name !== VOLUME_NAME
  ) {
    throw new Error(
      'tunelink_data musi być external volume o fizycznej nazwie tunelink_data.',
    );
  }

  const appVolumes =
    app?.volumes ?? [];

  const hasExpectedVolume =
    appVolumes.some((entry) => {
      if (typeof entry === 'string') {
        return (
          entry ===
          `${VOLUME_NAME}:/data`
        );
      }

      return (
        entry?.type === 'volume' &&
        entry?.source === VOLUME_NAME &&
        entry?.target === '/data'
      );
    });

  if (!hasExpectedVolume) {
    throw new Error(
      'tunelink_app musi montować tunelink_data dokładnie pod /data.',
    );
  }

  const ports =
    app?.ports ?? [];

  const hasExpectedPort =
    ports.some((entry) => {
      if (typeof entry === 'string') {
        return (
          entry.includes('127.0.0.1') &&
          entry.includes('3010')
        );
      }

      return (
        String(entry?.target) === '3010' &&
        String(entry?.published) === '3010' &&
        entry?.host_ip === '127.0.0.1'
      );
    });

  if (!hasExpectedPort) {
    throw new Error(
      'tunelink_app musi publikować 127.0.0.1:3010 -> 3010.',
    );
  }

  const healthTest = JSON.stringify(
    app?.healthcheck?.test ?? [],
  );

  if (
    !healthTest.includes(
      'process.env.PORT',
    )
  ) {
    throw new Error(
      'Healthcheck Compose musi używać process.env.PORT.',
    );
  }

  const composeSource =
    await readFile(
      COMPOSE_FILE,
      'utf8',
    );

  if (
    !composeSource.includes(
      '/etc/tunelink/compose.env',
    )
  ) {
    throw new Error(
      'Usługa tunnel musi korzystać z /etc/tunelink/compose.env.',
    );
  }

  if (
    !composeSource.includes(
      '${CLOUDFLARE_TUNNEL_TOKEN}',
    )
  ) {
    throw new Error(
      'Compose musi przekazywać CLOUDFLARE_TUNNEL_TOKEN przez interpolację zmiennej.',
    );
  }

  ok(
    'Compose jest ograniczony wyłącznie do zasobów TuneLink.',
  );
}

async function capturePreviousImage() {
  const result = await run(
    'docker',
    [
      'inspect',
      '--format',
      '{{.Image}}|{{.Config.Image}}',
      APP_CONTAINER,
    ],
    {
      allowFailure: true,
    },
  );

  if (result.code !== 0) {
    return;
  }

  [
    previousImageId,
    previousImageRef,
  ] = result.stdout
    .trim()
    .split('|');

  info(
    'Zapisano poprzedni obraz tunelink_app do ewentualnego rollbacku.',
  );
}

async function buildApp() {
  stage = 'application build';

  info(
    'Buduję TuneLink przed ruszeniem działającej aplikacji.',
  );

  await compose(
    [
      'build',
      'app',
    ],
    {
      stream: true,
    },
  );

  ok('Build zakończony.');

  const imageId = (
    await compose([
      'images',
      '-q',
      'app',
    ])
  ).stdout.trim();

  if (!imageId) {
    throw new Error(
      'Nie udało się ustalić ID zbudowanego obrazu usługi app.',
    );
  }

  return imageId;
}

async function ensureHelperContainerAbsent(name) {
  if (await containerExists(name)) {
    throw new Error(
      `Istnieje już kontener pomocniczy ${name}; odmawiam jego użycia lub usunięcia.`,
    );
  }
}

async function verifySpotifyVolume(
  volumeName,
  appImageId,
) {
  await ensureHelperContainerAbsent(
    PROBE_CONTAINER,
  );

  const probeCode = `
    const fs = require('node:fs');

    const file = '/data/spotify-token.json';
    const stats = fs.statSync(file);

    if (!stats.isFile() || stats.size <= 0) {
      process.exit(2);
    }
  `;

  const result = await run(
    'docker',
    [
      'run',
      '--rm',
      '--name',
      PROBE_CONTAINER,
      '--pull=never',
      '--user',
      '0:0',
      '--mount',
      `type=volume,source=${volumeName},destination=/data,readonly`,
      appImageId,
      'node',
      '-e',
      probeCode,
    ],
    {
      allowFailure: true,
    },
  );

  if (result.code !== 0) {
    throw new Error(
      `Volume ${volumeName} nie zawiera poprawnego /data/spotify-token.json.`,
    );
  }

  ok(
    `Volume ${volumeName}: spotify-token.json OK.`,
  );
}

async function copyVolume(
  sourceVolume,
  targetVolume,
  appImageId,
) {
  await ensureHelperContainerAbsent(
    MIGRATOR_CONTAINER,
  );

  const copyCode = `
    const fs = require('node:fs');
    const path = require('node:path');

    const sourceRoot = '/source';
    const targetRoot = '/data';

    function copyEntry(src, dst) {
      const st = fs.lstatSync(src);

      if (st.isDirectory()) {
        if (!fs.existsSync(dst)) {
          fs.mkdirSync(dst, {
            mode: st.mode,
          });
        }

        for (const name of fs.readdirSync(src)) {
          copyEntry(
            path.join(src, name),
            path.join(dst, name),
          );
        }
      } else if (st.isSymbolicLink()) {
        const target =
          fs.readlinkSync(src);

        try {
          fs.unlinkSync(dst);
        } catch {}

        fs.symlinkSync(
          target,
          dst,
        );
      } else {
        fs.copyFileSync(
          src,
          dst,
        );

        fs.chmodSync(
          dst,
          st.mode,
        );
      }

      try {
        fs.chownSync(
          dst,
          st.uid,
          st.gid,
        );
      } catch {}

      try {
        fs.utimesSync(
          dst,
          st.atime,
          st.mtime,
        );
      } catch {}
    }

    for (const name of fs.readdirSync(sourceRoot)) {
      copyEntry(
        path.join(sourceRoot, name),
        path.join(targetRoot, name),
      );
    }
  `;

  await run(
    'docker',
    [
      'run',
      '--rm',
      '--name',
      MIGRATOR_CONTAINER,
      '--pull=never',
      '--user',
      '0:0',
      '--mount',
      `type=volume,source=${sourceVolume},destination=/source,readonly`,
      '--mount',
      `type=volume,source=${targetVolume},destination=/data`,
      appImageId,
      'node',
      '-e',
      copyCode,
    ],
  );
}

async function ensurePersistentVolume(
  appImageId,
) {
  stage =
    'persistent volume validation';

  if (
    await volumeExists(VOLUME_NAME)
  ) {
    await verifySpotifyVolume(
      VOLUME_NAME,
      appImageId,
    );

    migrationAccepted = true;
    return;
  }

  if (!PREDECESSOR_VOLUME) {
    throw new Error(
      'Brak tunelink_data. Przy pierwszej migracji ustaw TUNELINK_PREDECESSOR_VOLUME na dokładną nazwę poprzedniego volume.',
    );
  }

  if (
    PREDECESSOR_VOLUME === VOLUME_NAME
  ) {
    throw new Error(
      'TUNELINK_PREDECESSOR_VOLUME nie może wskazywać na tunelink_data.',
    );
  }

  if (
    !(await volumeExists(
      PREDECESSOR_VOLUME,
    ))
  ) {
    throw new Error(
      'Wskazany predecessor volume nie istnieje.',
    );
  }

  info(
    'Migruję persistent data do tunelink_data.',
  );

  await verifySpotifyVolume(
    PREDECESSOR_VOLUME,
    appImageId,
  );

  await run(
    'docker',
    [
      'volume',
      'create',
      VOLUME_NAME,
    ],
  );

  createdVolumeThisRun = true;

  try {
    await copyVolume(
      PREDECESSOR_VOLUME,
      VOLUME_NAME,
      appImageId,
    );

    migratedVolumeThisRun = true;

    await verifySpotifyVolume(
      VOLUME_NAME,
      appImageId,
    );

    migrationAccepted = true;

    ok(
      'Migracja persistent volume zakończona poprawnie.',
    );
  } catch (error) {
    if (
      createdVolumeThisRun &&
      !migrationAccepted
    ) {
      await run(
        'docker',
        [
          'volume',
          'rm',
          VOLUME_NAME,
        ],
        {
          allowFailure: true,
        },
      );
    }

    throw error;
  }
}

async function preparePredecessorApp() {
  if (!PREDECESSOR_APP) {
    return;
  }

  if (
    !(await containerExists(
      PREDECESSOR_APP,
    ))
  ) {
    return;
  }

  predecessorAppWasRunning =
    (
      await containerState(
        PREDECESSOR_APP,
      )
    ) === 'running';

  if (!predecessorAppWasRunning) {
    return;
  }

  info(
    'Zatrzymuję dokładnie wskazaną poprzednią aplikację, aby zwolnić port 3010.',
  );

  await run(
    'docker',
    [
      'container',
      'stop',
      PREDECESSOR_APP,
    ],
  );

  predecessorAppWasStopped = true;
}

async function waitForHealthy() {
  stage = 'application health check';

  info(
    'Czekam maksymalnie 60 s na healthy + Spotify.',
  );

  const deadline =
    Date.now() + 60_000;

  while (Date.now() < deadline) {
    const health = await run(
      'docker',
      [
        'inspect',
        '--format',
        '{{.State.Health.Status}}',
        APP_CONTAINER,
      ],
      {
        allowFailure: true,
      },
    );

    if (
      health.stdout.trim() ===
      'healthy'
    ) {
      try {
        const response =
          await fetch(
            HEALTH_URL,
            {
              signal:
                AbortSignal.timeout(
                  5_000,
                ),
            },
          );

        const body =
          await response.json();

        if (
          response.status === 200 &&
          body?.status === 'ok' &&
          body?.spotifyConnected === true &&
          typeof body?.mcpEndpoint ===
            'string' &&
          body.mcpEndpoint.length > 0
        ) {
          ok(
            'tunelink_app healthy; Spotify connected.',
          );

          return body;
        }
      } catch {
        // Retry.
      }
    }

    await sleep(1_000);
  }

  throw new Error(
    'tunelink_app nie osiągnął healthy ze Spotify w ciągu 60 sekund.',
  );
}

async function ensureTunnelRunning() {
  stage = 'Cloudflare tunnel';

  info(
    'Synchronizuję wyłącznie usługę tunelink_tunnel z aktualnym Compose.',
  );

  await compose([
    'up',
    '-d',
    '--no-deps',
    'tunnel',
  ]);

  const deadline =
    Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (
      (
        await containerState(
          TUNNEL_CONTAINER,
        )
      ) === 'running'
    ) {
      ok(
        'tunelink_tunnel jest Running.',
      );

      return;
    }

    await sleep(1_000);
  }

  throw new Error(
    'tunelink_tunnel nie osiągnął stanu Running.',
  );
}

async function waitForPublicHealth(
  mcpEndpoint,
) {
  stage =
    'public Cloudflare health check';

  let publicHealth;

  try {
    const url =
      new URL(mcpEndpoint);

    publicHealth =
      new URL(
        '/health',
        url.origin,
      ).toString();
  } catch {
    throw new Error(
      'Health endpoint zwrócił niepoprawny mcpEndpoint.',
    );
  }

  info(
    `Sprawdzam publiczny health endpoint przez Cloudflare: ${publicHealth}`,
  );

  const deadline =
    Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response =
        await fetch(
          publicHealth,
          {
            signal:
              AbortSignal.timeout(
                5_000,
              ),
            redirect: 'follow',
          },
        );

      if (response.status === 200) {
        const body =
          await response.json();

        if (
          body?.status === 'ok' &&
          body?.spotifyConnected === true
        ) {
          ok(
            'Publiczny endpoint przez Cloudflare działa.',
          );

          return;
        }
      }
    } catch {
      // Retry.
    }

    await sleep(1_000);
  }

  throw new Error(
    'Publiczny /health przez Cloudflare nie zaczął działać w ciągu 30 sekund.',
  );
}

async function rollbackCurrentApp() {
  if (!appReplacementStarted) {
    return false;
  }

  if (
    !previousImageId ||
    !previousImageRef
  ) {
    warn(
      'Brak poprzedniego obrazu tunelink_app do rollbacku.',
    );

    return false;
  }

  stage = 'rollback';

  warn(
    'Przywracam poprzedni obraz wyłącznie tunelink_app.',
  );

  const tagged = await run(
    'docker',
    [
      'tag',
      previousImageId,
      previousImageRef,
    ],
    {
      allowFailure: true,
    },
  );

  if (tagged.code !== 0) {
    warn(
      'Nie udało się przywrócić poprzedniego tagu obrazu.',
    );

    return false;
  }

  const up = await compose(
    [
      'up',
      '-d',
      '--no-build',
      '--no-deps',
      '--force-recreate',
      'app',
    ],
    {
      allowFailure: true,
    },
  );

  if (up.code !== 0) {
    warn(
      'Nie udało się recreate tunelink_app podczas rollbacku.',
    );

    return false;
  }

  try {
    await waitForHealthy();

    ok(
      'Rollback tunelink_app zakończony i zweryfikowany.',
    );

    return true;
  } catch (error) {
    warn(
      `Rollback nie przeszedł healthchecka: ${errorText(error)}`,
    );

    return false;
  }
}

async function restorePredecessorApp() {
  if (
    !PREDECESSOR_APP ||
    !predecessorAppWasRunning ||
    !predecessorAppWasStopped
  ) {
    return false;
  }

  stage = 'predecessor rollback';

  warn(
    'Przywracam dokładnie wskazaną poprzednią aplikację.',
  );

  if (
    await containerExists(
      APP_CONTAINER,
    )
  ) {
    await run(
      'docker',
      [
        'container',
        'rm',
        '--force',
        APP_CONTAINER,
      ],
      {
        allowFailure: true,
      },
    );
  }

  const started = await run(
    'docker',
    [
      'container',
      'start',
      PREDECESSOR_APP,
    ],
    {
      allowFailure: true,
    },
  );

  if (started.code !== 0) {
    warn(
      'Nie udało się ponownie uruchomić poprzedniej aplikacji.',
    );

    return false;
  }

  if (
    (
      await containerState(
        PREDECESSOR_APP,
      )
    ) !== 'running'
  ) {
    warn(
      'Poprzednia aplikacja nie wróciła do stanu Running.',
    );

    return false;
  }

  ok(
    'Poprzednia aplikacja została przywrócona.',
  );

  return true;
}

async function removeExactContainer(name) {
  if (!name) {
    return;
  }

  if (
    !(await containerExists(name))
  ) {
    return;
  }

  await run(
    'docker',
    [
      'container',
      'rm',
      '--force',
      name,
    ],
  );

  ok(
    `Usunięto dokładnie wskazany predecessor container: ${name}`,
  );
}

async function cleanupPredecessorResources() {
  stage = 'predecessor cleanup';

  if (PREDECESSOR_TUNNEL) {
    await removeExactContainer(
      PREDECESSOR_TUNNEL,
    );
  }

  if (PREDECESSOR_APP) {
    await removeExactContainer(
      PREDECESSOR_APP,
    );
  }

  if (
    PREDECESSOR_VOLUME &&
    PREDECESSOR_VOLUME !== VOLUME_NAME &&
    (
      await volumeExists(
        PREDECESSOR_VOLUME,
      )
    )
  ) {
    const removed = await run(
      'docker',
      [
        'volume',
        'rm',
        PREDECESSOR_VOLUME,
      ],
      {
        allowFailure: true,
      },
    );

    if (removed.code === 0) {
      ok(
        'Usunięto poprzedni persistent volume po zaakceptowanej migracji.',
      );
    } else {
      warn(
        'Poprzedni volume nadal jest używany. Nie zatrzymuję żadnego nieznanego kontenera.',
      );
    }
  }

  if (
    PREDECESSOR_NETWORK &&
    PREDECESSOR_NETWORK !== NETWORK_NAME &&
    (
      await networkExists(
        PREDECESSOR_NETWORK,
      )
    )
  ) {
    const inspect = await run(
      'docker',
      [
        'network',
        'inspect',
        '--format',
        '{{len .Containers}}',
        PREDECESSOR_NETWORK,
      ],
      {
        allowFailure: true,
      },
    );

    if (
      inspect.code === 0 &&
      inspect.stdout.trim() === '0'
    ) {
      const removed = await run(
        'docker',
        [
          'network',
          'rm',
          PREDECESSOR_NETWORK,
        ],
        {
          allowFailure: true,
        },
      );

      if (removed.code === 0) {
        ok(
          'Usunięto pustą poprzednią sieć.',
        );
      }
    } else {
      warn(
        'Poprzednia sieć ma podłączone kontenery; pozostawiam ją bez zmian.',
      );
    }
  }
}

async function showAppLogs(secret) {
  if (
    !(await containerExists(
      APP_CONTAINER,
    ))
  ) {
    return;
  }

  const result = await run(
    'docker',
    [
      'logs',
      '--tail',
      '100',
      APP_CONTAINER,
    ],
    {
      allowFailure: true,
    },
  );

  const output = redact(
    `${result.stdout}${result.stderr}`,
    secret,
  ).trim();

  if (output) {
    console.error(
      '[WARN] Ostatnie logi tunelink_app:',
    );

    console.error(output);
  }
}

async function deploy() {
  const {
    cloudflareToken,
  } = await validatePreflight();

  await acquireLock();

  /*
   * Najpierw walidujemy konfigurację.
   * Żadnych zmian Dockera przed potwierdzeniem,
   * że Compose dotyczy wyłącznie TuneLink.
   */
  await validateCompose();

  /*
   * Capture poprzedniego obrazu musi nastąpić
   * PRZED buildem.
   */
  await capturePreviousImage();

  /*
   * Build musi zakończyć się sukcesem zanim
   * zatrzymamy cokolwiek działającego.
   */
  const appImageId =
    await buildApp();

  /*
   * Dopiero po udanym buildzie sprawdzamy/migrujemy
   * persistent storage.
   */
  await ensurePersistentVolume(
    appImageId,
  );

  /*
   * Jeżeli pierwszy rename wymaga zwolnienia :3010,
   * zatrzymujemy WYŁĄCZNIE dokładnie podany predecessor.
   */
  await preparePredecessorApp();

  stage =
    'application replacement';

  appReplacementStarted = true;

  info(
    'Uruchamiam wyłącznie tunelink_app.',
  );

  await compose([
    'up',
    '-d',
    '--no-deps',
    '--force-recreate',
    'app',
  ]);

  const health =
    await waitForHealthy();

  /*
   * Dopiero po poprawnym app uruchamiamy/synchronizujemy
   * tunnel.
   */
  await ensureTunnelRunning();

  /*
   * Sprawdzamy również realny publiczny endpoint,
   * nie tylko localhost.
   */
  await waitForPublicHealth(
    health.mcpEndpoint,
  );

  /*
   * Dopiero TERAZ uznajemy deployment za zaakceptowany.
   * Dzięki temu błąd tunelu/public health nadal uruchomi rollback.
   */
  migrationAccepted = true;
  appReplacementStarted = false;

  /*
   * Stare zasoby usuwamy wyłącznie po pełnym sukcesie.
   */
  await cleanupPredecessorResources();

  ok(
    'Deploy TuneLink zakończony pomyślnie.',
  );

  return {
    cloudflareToken,
  };
}

let cloudflareToken = '';

try {
  const result =
    await deploy();

  cloudflareToken =
    result?.cloudflareToken ?? '';
} catch (error) {
  console.error(
    `[ERROR] Stage: ${stage}. ${errorText(error)}`,
  );

  /*
   * Najpierw próbujemy rollback istniejącego TuneLink.
   */
  const rolledBack =
    await rollbackCurrentApp();

  /*
   * Jeśli to pierwszy rename i nie było poprzedniego obrazu TuneLink,
   * przywracamy dokładnie wskazaną poprzednią aplikację.
   */
  if (!rolledBack) {
    await restorePredecessorApp();
  }

  if (!cloudflareToken) {
    try {
      const text =
        await readFile(
          CLOUDFLARE_ENV_FILE,
          'utf8',
        );

      cloudflareToken =
        parseEnvValue(
          text,
          'CLOUDFLARE_TUNNEL_TOKEN',
        );
    } catch {
      cloudflareToken = '';
    }
  }

  await showAppLogs(
    cloudflareToken,
  );

  /*
   * Jeżeli nowy volume powstał wyłącznie w tym deployu,
   * migracja nie została zaakceptowana i żaden tunelink_app
   * już go nie używa, możemy usunąć WYŁĄCZNIE ten nowy volume.
   */
  if (
    createdVolumeThisRun &&
    migratedVolumeThisRun &&
    !migrationAccepted &&
    !(await containerExists(APP_CONTAINER))
  ) {
    const removed = await run(
      'docker',
      [
        'volume',
        'rm',
        VOLUME_NAME,
      ],
      {
        allowFailure: true,
      },
    );

    if (removed.code === 0) {
      warn(
        'Usunięto niezaakceptowane tunelink_data utworzone wyłącznie przez ten nieudany deploy.',
      );
    }
  }

  process.exitCode = 1;
} finally {
  if (lockHandle) {
    await lockHandle
      .close()
      .catch(() => {});
  }

  if (lockOwned) {
    await unlink(
      LOCK_FILE,
    ).catch(() => {});
  }
}