# Installation and deployment

## npm installation

Requires Node.js 22.13 or later. Once the official npm package is published:

```bash
npm install -g jamrelay
jamrelay setup
jamrelay start
```

`npx jamrelay setup`, `pnpm dlx jamrelay setup` and `bunx jamrelay setup` use the same Node-based package after publication. The setup wizard saves safe private storage and owner security, then exits. It does not open the management menu. Start JamRelay and run `jamrelay onboard` when you want to configure network access, music connections, MCP clients or manage the installation. Run `jamrelay connect provider spotify` to enter provider application credentials securely. Creating an application and authorizing a listener account are separate steps. See the [provider guides](/providers/) for service requirements.

The server will not start until setup has saved its persistent credential-encryption key, owner approval secret and public origin. These are used later to protect music-service credentials, approve OAuth connections and generate callback URLs. If setup has not run, an interactive local `jamrelay start` opens it first. Container starts stop with instructions to run setup explicitly, so a detached Compose service cannot hang waiting for keyboard input. Environment-only deployments must provide the same values explicitly.

**Publication is pending.** A GitHub commit or development version does not imply that npm or GHCR artifacts exist. `jamrelay update check` inspects actual official distribution metadata.

## CLI language

The first interactive setup screen presents its instructions in all five languages and shows native language names: Polski (`pl`), English (`en`), Deutsch (`de`), Français (`fr`), Español (`es`). Press a number to select immediately, use the arrow keys and Enter, or accept the detected language. The default follows `LC_ALL`, `LC_MESSAGES`, `LANG`, then the system locale; unsupported locales use English.

Setup saves `JAMRELAY_LANGUAGE` in the selected private configuration. Subsequent commands reuse it, and `jamrelay config` offers the language menu again while preserving credentials, encryption keys, paths and provider settings. `JAMRELAY_LANGUAGE` in the environment overrides the saved preference; `JAMRELAY_CONFIG_PATH` selects which installation to read, including for `--help`.

In an interactive terminal, `jamrelay help` or `jamrelay --help` opens the TUI command guide with descriptions by category. Without an interactive terminal, help is printed as plain text.

Interactive command results are shown in the JamRelay TUI and wait for Enter before returning to the terminal. The interactive `jamrelay start` screen stays open while the server runs; press Ctrl+C to stop it. Noninteractive commands keep their text output for scripts and service logs.

`jamrelay config` keeps network defaults unless you opt into advanced settings. Remote access requires a reachable HTTPS origin and a reverse proxy you control; only then should you trust forwarded proxy headers.

```bash
JAMRELAY_LANGUAGE=pl jamrelay --help
JAMRELAY_LANGUAGE=de jamrelay setup --yes
```

PowerShell: `$env:JAMRELAY_LANGUAGE = 'pl'`, then `jamrelay --help`. For Docker Compose, pass `-e JAMRELAY_LANGUAGE=fr` to `docker compose run --rm`. `setup --yes` never asks questions and saves the environment/saved/locale default. Localized confirmations also accept English `yes/no`. Command names, flags, provider IDs, URLs, JSON keys and machine-readable values remain unchanged; `--json` preserves the English interface. Provider data and release/notice content retain their original language.

## Owner password

Interactive setup offers masked password entry and confirmation (12–256 characters). Only a salted scrypt hash is saved in private configuration. Noninteractive `setup --yes` does not prompt and retains recovery-secret access. Existing installations can migrate or reset while stopped:

```bash
jamrelay owner password
# Compose, after docker compose stop jamrelay:
docker compose run --rm -it jamrelay owner password
```

Restart afterward. Encryption keys, recovery secret, provider tokens and OAuth grants are preserved. On `/owner/login` and OAuth consent use the password, or expand the recovery/legacy-secret alternative. Keep secrets out of AI chat and client configuration.

## Guided integrations

Configure application credentials before starting the server (or stop it before changing saved credentials):

```bash
jamrelay connect provider spotify
jamrelay start
jamrelay onboard
```

For Docker Compose, run setup and provider configuration with `docker compose run --rm -it jamrelay setup` and `docker compose run --rm -it jamrelay connect provider spotify`, then start the service with `docker compose up -d`. `jamrelay onboard` (or `docker compose run --rm -it jamrelay onboard`) opens the main management menu. `jamrelay connectivity` (or `docker compose run --rm -it jamrelay connectivity`) opens network setup directly. Provider authorization uses the existing owner login and OAuth consent page. `jamrelay connect client chatgpt|claude-code|claude-desktop|cursor|vscode|generic` provides client-specific configuration (the `claude` alias asks which application). Local Claude Code registration and Cursor/VS Code JSON edits require confirmation, preserve other settings and back up files. Docker only prints host-side commands. Add `--verify` after browser authentication and tool discovery to check server-observed evidence. The CLI reports generated/configured/authenticated/verified states separately and the exact `/mcp` URL. A cloud client cannot reach private `localhost`; use an eligible secure tunnel or a reachable HTTPS endpoint.

## Development candidate archive

From a checkout with development dependencies installed, build and install the actual archive reported by npm, without hardcoding a package version:

```bash
npm ci
npm pack --pack-destination /tmp
```

Then run `npm install -g <archive-path-printed-by-npm>` followed by `jamrelay setup` and `jamrelay start`. On Windows, use a writable temporary directory instead of `/tmp`. Installed users need neither TypeScript nor a source checkout.

## Persistent configuration and upgrades

The wizard uses XDG directories on Linux, Application Support on macOS and AppData on Windows. Existing `.env` deployments and environment path overrides are retained. `JAMRELAY_CONFIG_PATH` selects a private configuration file; run `jamrelay config` from the original deployment directory to preserve existing relative paths as absolute paths.

Stop the server before reconfiguration or upgrades. If setup finds JamRelay already running or another setup holding the configuration lock, it keeps the warning in the setup screen until you press Enter, then exits without changing configuration. After an unclean exit, allow up to 30 seconds for lock recovery. Back up data **and** private configuration, preserve encryption keys, install the new package, run `jamrelay doctor`, then `jamrelay start`. Do not silently move data or replace keys. See the [connectivity guide](/connectivity) for local-only access, tunnels, custom domains, HTTPS checks and recovery; see [operations](/operations) for migration/recovery details and the [CLI reference](/cli-information) for update channels and offline notices.

## Docker Compose (recommended)

The repository's `compose.yml` builds locally and needs no tunnel, external network or pre-created volume:

```bash
docker compose run --rm -it jamrelay setup
docker compose up -d --wait
docker compose ps
docker compose logs -f jamrelay
```

The named `jamrelay_data` volume persists `/data/jamrelay.env`, SQLite and credentials. Set `JAMRELAY_VOLUME_NAME` to an existing differently named volume when upgrading. Host binding defaults to `127.0.0.1:5267`; `JAMRELAY_PORT` changes the host port while the container listener remains on 5267. Setup and connection instructions use the published host port automatically. `docker compose up -d --wait` waits for the health check; check `http://127.0.0.1:<JAMRELAY_PORT>/health` and `/mcp` from the host. A custom HTTPS `PUBLIC_BASE_URL` is preserved.

`compose.legacy.yml` retains the existing app/tunnel topology used by `scripts/deploy.mjs`. It is for that established deployment workflow, not a second recommended installer. Root Compose aliases have been removed; use `docker compose` or `docker compose -f compose.yml`.

For a standalone image, build with `docker build -t jamrelay:local .`, then:

```bash
docker run --rm -it -v jamrelay_data:/data jamrelay:local setup
docker run --rm -p 127.0.0.1:5267:5267 -v jamrelay_data:/data jamrelay:local start
```

Official images, when intentionally published, use `ghcr.io/makkiattooo/jamrelay` with the selected published tag. Preserve `/data` when replacing containers. Version tags and optional explicit workflow dispatch control GHCR publication; development-branch pushes do not publish images.

## Local development

```bash
npm ci
cp .env.example .env
npm run dev
```

PowerShell:

```powershell
Copy-Item .env.example .env
npm run dev
```

The development command loads `.env` automatically. Local token files default to `./data/`, so a non-Docker installation does not require a system-level `/data` directory.

Use `http://127.0.0.1:5267` in `.env` and register the matching Spotify callback.

## Local production

```bash
npm ci
npm run build
npm start
```

## VPS, home server, or NAS

Install Node.js 22 or Docker, copy `.env`, persist `/data`, restrict the application port to localhost or a private network, and terminate HTTPS at a reverse proxy. A generic Ubuntu/Debian host works; NAS products differ, so use their container or service manager while keeping the same environment and volume rules.

### Minimal systemd shape for Node

```ini
[Unit]
Description=JamRelay MCP server
After=network-online.target

[Service]
WorkingDirectory=/opt/jamrelay
EnvironmentFile=/opt/jamrelay/.env
ExecStart=/usr/bin/node /opt/jamrelay/dist/index.js
Restart=on-failure
User=jamrelay
Group=jamrelay
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Use the Node binary path provided by the host, keep the service user unprivileged, and grant it access only to the application and `/data`.

## Reverse proxy

For Caddy:

```text
mcp.example.com {
  reverse_proxy 127.0.0.1:5267
}
```

For nginx:

```nginx
server {
    listen 443 ssl;
    server_name mcp.example.com;
    location / { proxy_pass http://127.0.0.1:5267; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
}
```

Set `PUBLIC_BASE_URL=https://mcp.example.com` and `TRUST_PROXY=true` only when every proxy in front of the app is trusted and correctly configured.

The proxy must forward the original host and scheme. If it terminates TLS, keep the application listener private and use the HTTPS origin as `PUBLIC_BASE_URL`.

## Cloudflare Tunnel

```text
Internet → Cloudflare → cloudflared → MCP application (127.0.0.1:5267)
```

Run `cloudflared` separately, map only the intended hostname, and store its credentials outside the repository. Do not place tunnel tokens in Compose files or documentation.

## Production checklist

- `PUBLIC_BASE_URL` is the externally reachable HTTPS origin.
- Spotify and MCP callback URLs exactly match provider/client configuration.
- `/data` is persistent, private, and included in protected backups.
- The application port is not unnecessarily exposed to the internet.
- Proxy headers and `TRUST_PROXY` agree.
- Healthchecks monitor liveness; an authenticated read monitors Spotify connectivity.
- Logs are protected and have a retention policy.

## Start without provider accounts

Skip providers during setup. For `.env` deployments, leave complete optional provider groups empty. Keep owner security configured before authorizing accounts. See [configuration](/configuration) and [provider connections](/provider-connections) for the required fields; never replace an existing encryption key.
