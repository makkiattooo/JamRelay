# Installation and deployment

## Packaged installation (1.5.0)

The npm package and GHCR image are prepared but not published yet. Build a candidate with `npm pack`, then install its archive:

```bash
npm install -g ./jamrelay-1.5.0.tgz
jamrelay setup
jamrelay start
jamrelay doctor
```

After publication use `npm install -g jamrelay` or `npx jamrelay setup` (also `pnpm dlx` / `bunx`, with Node.js installed). The unified CLI retains all local operator commands. `jamrelay config` safely reopens setup; `setup --yes` reads environment variables for automation.

Private configuration/data defaults follow XDG, macOS Application Support, or Windows AppData. Environment overrides and existing `.env` deployments are retained. Set `JAMRELAY_CONFIG_PATH` for an explicit private file; run reconfiguration from the original deployment directory to retain relative paths. Back up the encryption key separately from application backups. Stop the service before setup/reconfiguration.

Recommended Docker flow (no tunnel or external network required):

```bash
docker compose run --rm jamrelay setup
docker compose up -d
docker compose logs -f jamrelay
```

The named `jamrelay_data` volume (override `JAMRELAY_VOLUME_NAME` for existing differently named volumes) persists `/data/jamrelay.env`, SQLite and credentials. Localhost port mapping is configurable with `JAMRELAY_PORT`; use the actual host port in the public URL. Images run `jamrelay start` using the same configuration model as npm.

For remote MCP use reachable HTTPS plus a reverse proxy. Setup prints the actual `/mcp` endpoint; add it to your client, complete owner consent and verify with `tools/list`. Provider developer credentials are optional and never automatically provisioned.

Upgrade 1.4.0 by stopping the server, backing up private configuration and data, installing the package and starting with the same paths/keys. Migration 0012 is preserved; no 1.5.0 migration is needed.

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

## Docker

```bash
docker build -t jamrelay .
docker run --env-file .env -p 127.0.0.1:5267:5267 -v jamrelay-data:/data jamrelay
```

## Docker Compose

```bash
docker compose up -d --build
```

The example binds to localhost, persists `/data`, drops privileges in the image, and includes a health check. Put an HTTPS reverse proxy in front of it for remote clients.

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

## Initialize without provider accounts

Use Node.js 22.13 or later. After copying `.env.example`, clear entire optional provider configuration groups (including redirect URIs) to boot with no provider credentials. Set `PUBLIC_BASE_URL`, `MCP_OAUTH_OWNER_SECRET`, and a strong 32-byte base64 `TOKEN_ENCRYPTION_KEY` before connecting providers. Generate the key locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and store it privately in `.env`.

`npm run operator -- status` or application startup initializes SQLite and applies migrations without resetting existing data. `npm run operator -- connections list` requires the matching encryption key. Follow [operations](/operations) for upgrading an existing installation; never generate a replacement key over existing encrypted records.
