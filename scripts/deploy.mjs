#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPattern = /^(\d{4})_[a-z0-9][a-z0-9_-]*\.sql$/;

function expectedSchemaVersion() {
  const migrationsDir = path.join(repoRoot, 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));
  const prefixes = new Set();
  const valid = files.map((file) => {
    const match = migrationPattern.exec(file);
    if (!match) throw new Error(`Invalid migration filename: ${file}`);
    if (prefixes.has(match[1])) throw new Error(`Duplicate migration numeric prefix: ${match[1]}`);
    prefixes.add(match[1]);
    return file;
  });
  if (!valid.length) throw new Error('No database migrations found');
  return valid.sort((a, b) => a.localeCompare(b, 'en')).at(-1);
}

const defaults = {
  host: process.env.TUNELINK_VPS_HOST ?? '91.134.132.235',

  user: process.env.TUNELINK_VPS_USER ?? 'ubuntu',

  appPath: process.env.TUNELINK_VPS_APP_PATH ?? '/srv/tunelink',

  appEnvFile: process.env.TUNELINK_VPS_APP_ENV_FILE ?? '/srv/tunelink/.env',

  tunnelTokenFile: process.env.TUNELINK_VPS_TUNNEL_TOKEN_FILE ?? '/etc/tunelink/tunnel-token',

  localBaseUrl: process.env.TUNELINK_LOCAL_BASE_URL ?? 'http://127.0.0.1:3010',

  publicBaseUrl: process.env.TUNELINK_PUBLIC_BASE_URL ?? 'https://tunelink-mcp.mealoo.pl',
};

function createStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

function parseArgs(argv) {
  const options = {
    ...defaults,

    tag: `deploy-${createStamp()}`,

    skipCheck: false,
    fullCheck: false,
    skipPublicCheck: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--tag' && next) {
      options.tag = next;
      i += 1;
      continue;
    }

    if (arg === '--host' && next) {
      options.host = next;
      i += 1;
      continue;
    }

    if (arg === '--user' && next) {
      options.user = next;
      i += 1;
      continue;
    }

    if (arg === '--app-path' && next) {
      options.appPath = next;
      i += 1;
      continue;
    }

    if (arg === '--app-env-file' && next) {
      options.appEnvFile = next;
      i += 1;
      continue;
    }

    if (arg === '--tunnel-token-file' && next) {
      options.tunnelTokenFile = next;
      i += 1;
      continue;
    }

    if (arg === '--local-base-url' && next) {
      options.localBaseUrl = next.replace(/\/$/, '');

      i += 1;
      continue;
    }

    if (arg === '--public-base-url' && next) {
      options.publicBaseUrl = next.replace(/\/$/, '');

      i += 1;
      continue;
    }

    if (arg === '--skip-check') {
      options.skipCheck = true;
      continue;
    }

    if (arg === '--full-check') {
      options.fullCheck = true;
      continue;
    }

    if (arg === '--skip-public-check') {
      options.skipPublicCheck = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log(`
Usage:
  npm run deploy:vps -- [options]

Options:
  --tag <tag>
  --host <host>
  --user <user>
  --app-path <path>
  --app-env-file <path>
  --tunnel-token-file <path>
  --local-base-url <url>
  --public-base-url <url>
  --skip-check
  --full-check
  --skip-public-check
  --dry-run
  -h, --help
`);

      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(options.tag)) {
    throw new Error('Invalid deployment tag.');
  }

  new URL(options.localBaseUrl);
  new URL(options.publicBaseUrl);

  options.tarballPath = `/home/${options.user}/tunelink-${options.tag}.tar.gz`;
  options.expectedSchemaVersion = expectedSchemaVersion();

  return options;
}

function runStep(label, command, args, options = {}) {
  console.log(`\n▶ ${label}`);

  const result = spawnSync(command, args, {
    cwd: repoRoot,

    stdio: options.input !== undefined ? ['pipe', 'inherit', 'inherit'] : 'inherit',

    ...options,
  });

  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }

  console.log(`✓ ${label}`);
}

function runNpmStep(label, args) {
  if (process.platform === 'win32') {
    console.log(`\n▶ ${label}`);

    const result = spawnSync(
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', `npm ${args.join(' ')}`],
      {
        cwd: repoRoot,
        stdio: 'inherit',
      },
    );

    if (result.error) {
      throw new Error(`${label} failed: ${result.error.message}`);
    }

    if (result.status !== 0) {
      throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
    }

    console.log(`✓ ${label}`);
    return;
  }

  runStep(label, 'npm', args);
}

function assertTools() {
  for (const tool of ['tar', 'scp', 'ssh']) {
    const result = spawnSync(tool, ['--version'], {
      cwd: repoRoot,
      stdio: 'ignore',
    });

    if (result.error) {
      throw new Error(`Missing required tool: ${tool}`);
    }
  }
}

function assertLocalLayout() {
  for (const relative of [
    'package.json',
    'package-lock.json',
    'Dockerfile',
    '.dockerignore',
    'compose.yml',
    'tsconfig.json',
    'src',
    'db',
    'db/migrations',
    'db/migrations/0001_state_db.sql',
  ]) {
    const target = path.join(repoRoot, relative);

    if (!fs.existsSync(target)) {
      throw new Error(`Missing project path: ${relative}`);
    }
  }
}

function runLocalChecks(options) {
  if (options.skipCheck) {
    return;
  }

  if (options.fullCheck) {
    runNpmStep('Local lint', ['run', 'lint']);

    runNpmStep('Local tests', ['test']);
  }

  runNpmStep('Local build', ['run', 'build']);
}

function buildTarball(tarballPath) {
  if (fs.existsSync(tarballPath)) {
    fs.unlinkSync(tarballPath);
  }

  runStep('Build deployment tarball', 'tar', [
    '-czf',
    tarballPath,

    '-C',
    repoRoot,

    '--exclude=.git',
    '--exclude=.git/**',

    '--exclude=.github',
    '--exclude=.github/**',

    '--exclude=.vscode',
    '--exclude=.vscode/**',

    '--exclude=.idea',
    '--exclude=.idea/**',

    '--exclude=node_modules',
    '--exclude=node_modules/**',

    '--exclude=dist',
    '--exclude=dist/**',

    '--exclude=data',
    '--exclude=data/**',

    '--exclude=.env',
    '--exclude=.env.*',

    '--exclude=docker-compose.yml',

    '--exclude=scripts/deploy.mjs',

    '.',
  ]);

  const listing = spawnSync('tar', ['-tzf', tarballPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (listing.error || listing.status !== 0 || !listing.stdout.includes('db/migrations/')) {
    throw new Error('Deployment tarball does not contain db/migrations');
  }
}

function remoteScript(options) {
  return `set -euo pipefail

app_dir=${JSON.stringify(options.appPath)}
app_env_file=${JSON.stringify(options.appEnvFile)}
token_file=${JSON.stringify(options.tunnelTokenFile)}
tarball_path=${JSON.stringify(options.tarballPath)}

local_health_url=${JSON.stringify(`${options.localBaseUrl}/health`)}

public_health_url=${JSON.stringify(`${options.publicBaseUrl}/health`)}

skip_public_check=${options.skipPublicCheck ? '1' : '0'}

deploy_tag=${JSON.stringify(options.tag)}
expected_schema_version=${JSON.stringify(options.expectedSchemaVersion)}

project_name="tunelink"

app_container="tunelink_app"
tunnel_container="tunelink_tunnel"

volume_name="tunelink_data"
network_name="tunelink_internal"

app_image="tunelink-app:latest"
rollback_tag="tunelink-app:rollback-$deploy_tag"

backup_path="/tmp/tunelink-source-$deploy_tag.tar.gz"
lock_file="/tmp/tunelink-deploy.lock"

cloudflare_token=""

source_changed=0
source_backup_exists=0

old_app_exists=0
old_app_running=0
app_changed=0
rollback_image_saved=0

old_tunnel_exists=0
old_tunnel_running=0
tunnel_changed=0

deploy_ok=0


compose() {
  sudo env \\
    CLOUDFLARE_TUNNEL_TOKEN="$cloudflare_token" \\
    docker compose \\
      -p "$project_name" \\
      -f "$app_dir/compose.yml" \\
      "$@"
}


wait_local_health() {
  attempts=0

  while [ "$attempts" -lt 120 ]; do
    attempts=$((attempts + 1))

    docker_health="$(
      sudo docker inspect \\
        -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \\
        "$app_container" \\
        2>/dev/null || true
    )"

    if [ "$docker_health" = "healthy" ]; then
      body="$(
        curl \\
          -fsS \\
          --connect-timeout 3 \\
          --max-time 5 \\
          "$local_health_url" \\
          2>/dev/null || true
      )"

      if printf '%s' "$body" |
           grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' &&
         printf '%s' "$body" |
           grep -Eq '"spotifyConnected"[[:space:]]*:[[:space:]]*true' &&
         printf '%s' "$body" |
           grep -Fq '"schemaVersion":"'$expected_schema_version'"'; then

        return 0
      fi
    fi

    sleep 1
  done

  return 1
}


wait_public_health() {
  attempts=0

  while [ "$attempts" -lt 60 ]; do
    attempts=$((attempts + 1))

    body="$(
      curl \\
        -fsS \\
        --connect-timeout 5 \\
        --max-time 10 \\
        "$public_health_url" \\
        2>/dev/null || true
    )"

    if printf '%s' "$body" |
         grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' &&
       printf '%s' "$body" |
         grep -Eq '"spotifyConnected"[[:space:]]*:[[:space:]]*true'; then

      return 0
    fi

    sleep 1
  done

  return 1
}


restore_source() {
  if [ "$source_changed" -ne 1 ]; then
    return 0
  fi

  echo "Restoring previous TuneLink source..." >&2

  sudo find "$app_dir" \\
    -mindepth 1 \\
    -maxdepth 1 \\
    ! -name '.env' \\
    -exec rm -rf -- {} +

  if [ "$source_backup_exists" -eq 1 ]; then
    sudo tar \\
      -xzf "$backup_path" \\
      -C "$app_dir"
  fi

  source_changed=0
}


rollback_app() {
  if [ "$app_changed" -ne 1 ]; then
    return 0
  fi

  echo "Rolling back tunelink_app..." >&2

  if [ "$old_app_exists" -eq 1 ] &&
     [ "$rollback_image_saved" -eq 1 ]; then

    sudo docker tag \\
      "$rollback_tag" \\
      "$app_image"

    compose up \\
      -d \\
      --no-build \\
      --no-deps \\
      --force-recreate \\
      app || {
        echo "ERROR: app rollback failed." >&2
        return 1
      }

    if ! wait_local_health; then
      echo "ERROR: rolled back app did not become healthy." >&2
      sudo docker logs \\
        --tail=100 \\
        "$app_container" \\
        >&2 || true
      return 1
    fi

    if [ "$old_app_running" -ne 1 ]; then
      compose stop app >/dev/null 2>&1 || true
    fi

    echo "tunelink_app rollback OK." >&2
    return 0
  fi

  sudo docker rm \\
    -f "$app_container" \\
    >/dev/null 2>&1 || true

  return 0
}


rollback_tunnel() {
  if [ "$tunnel_changed" -ne 1 ]; then
    return 0
  fi

  echo "Rolling back tunelink_tunnel..." >&2

  if [ "$old_tunnel_exists" -eq 1 ]; then
    compose up \\
      -d \\
      --no-deps \\
      --force-recreate \\
      tunnel || {
        echo "ERROR: tunnel rollback failed." >&2
        return 1
      }

    if [ "$old_tunnel_running" -ne 1 ]; then
      compose stop tunnel >/dev/null 2>&1 || true
    fi

    return 0
  fi

  sudo docker rm \\
    -f "$tunnel_container" \\
    >/dev/null 2>&1 || true
}


rollback() {
  echo "Deploy failed. Rolling back..." >&2

  restore_source || true

  rollback_app || true

  rollback_tunnel || true
}


cleanup() {
  status=$?

  trap - EXIT

  if [ "$status" -ne 0 ] &&
     [ "$deploy_ok" -ne 1 ]; then

    rollback || true
  fi

  rm -f "$tarball_path" \\
    >/dev/null 2>&1 || true

  sudo rm -f "$backup_path" \\
    >/dev/null 2>&1 || true

  if [ "$rollback_image_saved" -eq 1 ]; then
    sudo docker image rm \\
      "$rollback_tag" \\
      >/dev/null 2>&1 || true
  fi

  rm -f "$lock_file" \\
    >/dev/null 2>&1 || true

  exit "$status"
}


trap cleanup EXIT


for command in \\
  docker \\
  curl \\
  tar \\
  grep \\
  sort \\
  tr \\
  stat \\
  flock; do

  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing VPS tool: $command" >&2
    exit 1
  fi
done


exec 9>"$lock_file"

if ! flock -n 9; then
  echo "Another TuneLink deploy is already running." >&2
  exit 1
fi


if [ ! -f "$tarball_path" ]; then
  echo "Deployment tarball missing: $tarball_path" >&2
  exit 1
fi


if [ ! -d "$app_dir" ]; then
  echo "TuneLink directory missing: $app_dir" >&2
  exit 1
fi


if [ ! -f "$app_env_file" ]; then
  echo "App env missing: $app_env_file" >&2
  exit 1
fi


if ! sudo test -s "$token_file"; then
  echo "Tunnel token file missing or empty: $token_file" >&2
  exit 1
fi


token_mode="$(
  sudo stat \\
    -c '%U:%G %a' \\
    "$token_file"
)"


if [ "$token_mode" != "root:root 600" ]; then
  echo "Tunnel token file must be root:root 600." >&2
  exit 1
fi


if ! sudo grep -Eq \\
  '^PORT=3010$' \\
  "$app_env_file"; then

  echo "PORT=3010 missing from app env." >&2
  exit 1
fi


cloudflare_token="$(
  sudo cat "$token_file"
)"


if [ -z "$cloudflare_token" ]; then
  echo "Cloudflare tunnel token is empty." >&2
  exit 1
fi


sudo docker info >/dev/null
sudo docker compose version >/dev/null


if ! sudo docker volume inspect \\
  "$volume_name" \\
  >/dev/null 2>&1; then

  echo "Required volume missing: $volume_name" >&2
  exit 1
fi


if ! sudo docker network inspect \\
  "$network_name" \\
  >/dev/null 2>&1; then

  echo "Required network missing: $network_name" >&2
  exit 1
fi


if sudo docker inspect \\
  "$app_container" \\
  >/dev/null 2>&1; then

  old_app_exists=1

  app_state="$(
    sudo docker inspect \\
      -f '{{.State.Status}}' \\
      "$app_container"
  )"

  if [ "$app_state" = "running" ]; then
    old_app_running=1
  fi

  old_image_id="$(
    sudo docker inspect \\
      -f '{{.Image}}' \\
      "$app_container"
  )"

  sudo docker tag \\
    "$old_image_id" \\
    "$rollback_tag"

  rollback_image_saved=1
fi


if sudo docker inspect \\
  "$tunnel_container" \\
  >/dev/null 2>&1; then

  old_tunnel_exists=1

  tunnel_state="$(
    sudo docker inspect \\
      -f '{{.State.Status}}' \\
      "$tunnel_container"
  )"

  if [ "$tunnel_state" = "running" ]; then
    old_tunnel_running=1
  fi
fi


if [ -n "$(
  sudo find "$app_dir" \\
    -mindepth 1 \\
    -maxdepth 1 \\
    ! -name '.env' \\
    -print -quit
)" ]; then

  sudo tar \\
    --exclude='./.env' \\
    -czf "$backup_path" \\
    -C "$app_dir" \\
    .

  sudo chmod 600 "$backup_path"

  source_backup_exists=1
fi


echo "Installing new TuneLink source..."

source_changed=1


sudo find "$app_dir" \\
  -mindepth 1 \\
  -maxdepth 1 \\
  ! -name '.env' \\
  -exec rm -rf -- {} +


sudo tar \\
  -xzf "$tarball_path" \\
  -C "$app_dir"


if [ ! -f "$app_dir/compose.yml" ]; then
  echo "compose.yml missing after extraction." >&2
  exit 1
fi


echo "Validating Compose..."


services="$(
  compose config --services |
    sort |
    tr '\\n' ' '
)"


if [ "$services" != "app tunnel " ]; then
  echo "Compose must contain exactly: app tunnel" >&2
  exit 1
fi


volumes="$(
  compose config --volumes |
    sort |
    tr '\\n' ' '
)"


if [ "$volumes" != "tunelink_data " ]; then
  echo "Compose must contain exactly tunelink_data." >&2
  exit 1
fi


networks="$(
  compose config --networks |
    sort |
    tr '\\n' ' '
)"


if [ "$networks" != "tunelink_internal " ]; then
  echo "Compose must contain exactly tunelink_internal." >&2
  exit 1
fi


echo "Building TuneLink..."

compose build app


echo "Replacing tunelink_app..."

app_changed=1


compose up \\
  -d \\
  --no-deps \\
  --force-recreate \\
  app


if ! wait_local_health; then
  echo "New tunelink_app failed health check." >&2

  sudo docker logs \\
    --tail=100 \\
    "$app_container" \\
    >&2 || true

  exit 1
fi


echo "tunelink_app healthy."


echo "Replacing tunelink_tunnel..."

tunnel_changed=1


compose up \\
  -d \\
  --no-deps \\
  --force-recreate \\
  tunnel


tunnel_running=0


for attempt in $(seq 1 30); do
  state="$(
    sudo docker inspect \\
      -f '{{.State.Status}}' \\
      "$tunnel_container" \\
      2>/dev/null || true
  )"

  if [ "$state" = "running" ]; then
    tunnel_running=1
    break
  fi

  sleep 1
done


if [ "$tunnel_running" -ne 1 ]; then
  echo "tunelink_tunnel failed to start." >&2

  sudo docker logs \\
    --tail=100 \\
    "$tunnel_container" \\
    >&2 || true

  exit 1
fi


echo "tunelink_tunnel running."


if [ "$skip_public_check" -ne 1 ]; then
  echo "Checking public TuneLink health..."

  if ! wait_public_health; then
    echo "Public TuneLink health failed: $public_health_url" >&2

    sudo docker logs \\
      --tail=100 \\
      "$tunnel_container" \\
      >&2 || true

    exit 1
  fi

  echo "Public TuneLink health OK."
fi


deploy_ok=1

source_changed=0
app_changed=0
tunnel_changed=0


echo "TuneLink deploy completed successfully."
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  assertTools();
  assertLocalLayout();

  const remoteTarget = `${options.user}@${options.host}`;

  const localTarballPath = path.resolve(os.tmpdir(), `tunelink-${options.tag}.tar.gz`);

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',

          target: remoteTarget,

          appPath: options.appPath,

          appEnvFile: options.appEnvFile,

          tunnelTokenFile: options.tunnelTokenFile,

          remoteTarball: options.tarballPath,

          localHealth: `${options.localBaseUrl}/health`,

          publicHealth: `${options.publicBaseUrl}/health`,
        },

        null,
        2,
      ),
    );

    return;
  }

  try {
    runLocalChecks(options);

    buildTarball(localTarballPath);

    runStep('Upload project', 'scp', [localTarballPath, `${remoteTarget}:${options.tarballPath}`]);

    runStep('Deploy on VPS', 'ssh', [remoteTarget, 'bash', '-s'], {
      input: remoteScript(options),
    });

    console.log(`\n✓ TuneLink deployed: ${options.tag}`);
  } finally {
    if (fs.existsSync(localTarballPath)) {
      fs.unlinkSync(localTarballPath);
    }
  }
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(`\n✗ Deploy failed: ${error.message}`);

    process.exit(1);
  });
}
