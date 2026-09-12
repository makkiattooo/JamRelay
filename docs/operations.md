# Operations runbook

This page is for operating an already configured deployment.

## Start, inspect, restart

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 tunelink
docker compose restart tunelink
```

For Node deployments, use a process supervisor and keep `.env` outside shell history and logs. The application listens on `HOST` and `PORT`; the reverse proxy owns the public HTTPS listener.

## Health verification

Check process health, OAuth metadata, then an authenticated read:

```bash
curl -fsS https://mcp.example.com/health
curl -fsS https://mcp.example.com/.well-known/oauth-authorization-server
```

Call `get_devices` or `get_currently_playing` from the client. A green healthcheck does not prove that Spotify authorization or playback is available.

## Backups and restore

`/data` contains the encrypted Spotify token store and MCP OAuth store. Back it up through a protected system. The encryption key is outside `/data`; a backup without `TOKEN_ENCRYPTION_KEY` cannot decrypt Spotify tokens.

For restore: stop the app, verify ownership and permissions, restore `/data`, restore matching environment configuration, and start the app. Do not merge stores from unrelated installations.

## Revocation and reauthorization

For `reauthorization_required`, stop retrying writes, check `/auth/status`, and authorize again. To revoke Spotify access, remove the app authorization in Spotify and delete the local Spotify token store. To invalidate MCP sessions, remove the MCP OAuth store and rotate the configured client/owner secrets during maintenance.

## Rotation warning

Changing `TOKEN_ENCRYPTION_KEY` without a migration makes the existing encrypted Spotify store unreadable. Plan a controlled reauthorization or decrypt/re-encrypt migration first. Changing the MCP client secret prevents future exchanges; deleting the OAuth store is required for full session invalidation.

## Logs and upgrades

Logs contain paths, statuses, latency, retry counts, and sanitized excerpts. Treat them as sensitive because paths can reveal account activity. For upgrades, back up `/data`, run all quality checks in a clean checkout, deploy the new artifact, verify health/metadata/tools, then perform one read-only Spotify call before testing writes.
