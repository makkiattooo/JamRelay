# Installation and deployment

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

Use `http://127.0.0.1:3000` in `.env` and register the matching Spotify callback.

## Local production

```bash
npm ci
npm run build
npm start
```

## Docker

```bash
docker build -t tunelink .
docker run --env-file .env -p 127.0.0.1:3000:3000 -v tunelink-data:/data tunelink
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
Description=TuneLink MCP server
After=network-online.target

[Service]
WorkingDirectory=/opt/tunelink
EnvironmentFile=/opt/tunelink/.env
ExecStart=/usr/bin/node /opt/tunelink/dist/index.js
Restart=on-failure
User=tunelink
Group=tunelink
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
  reverse_proxy 127.0.0.1:3000
}
```

For nginx:

```nginx
server {
    listen 443 ssl;
    server_name mcp.example.com;
    location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
}
```

Set `PUBLIC_BASE_URL=https://mcp.example.com` and `TRUST_PROXY=true` only when every proxy in front of the app is trusted and correctly configured.

The proxy must forward the original host and scheme. If it terminates TLS, keep the application listener private and use the HTTPS origin as `PUBLIC_BASE_URL`.

## Cloudflare Tunnel

```text
Internet → Cloudflare → cloudflared → MCP application (127.0.0.1:3000)
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
