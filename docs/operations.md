# Operations runbook

During SIGTERM/SIGINT the server closes the HTTP listener, stops claiming new
durable jobs, drains or aborts active work, and closes SQLite last. Provider
requests inherit the remaining MCP deadline and cancellation signal. Heavy
transfer and bulk-job tools use a longer bounded execution budget.

This page is for operating an already configured deployment.

The owner console is available at `/admin`. It provides the overview,
connection hub, MCP client access, durable jobs, sanitized diagnostics, active
toolset, and system status. Console assets are self-hosted under
`/assets/admin/`; OAuth authorization pages retain their separate restrictive
security policy. The HTML routes are mounted through the dedicated admin
router, and successful owner mutations use one-request session-backed flash
feedback rather than arbitrary message text in URLs.

## Start, inspect, restart

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 jamrelay
docker compose restart jamrelay
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

`/data` contains the encrypted provider token store and MCP OAuth store. Owners can create an application-aware backup from `/admin/backups` (or with `npm run backup -- --output <directory>`). The operation is CSRF-protected and the encryption key is never included in the backup; keep that key separately because a backup without it cannot decrypt provider tokens.

For restore: stop the app, verify ownership and permissions, restore `/data`, restore matching environment configuration, and start the app. Do not merge stores from unrelated installations.

## Revocation and reauthorization

For `reauthorization_required`, stop retrying writes, check `/auth/status`, and authorize again. To revoke Spotify access, remove the app authorization in Spotify and delete the local Spotify token store. To invalidate MCP sessions, remove the MCP OAuth store and rotate the configured client/owner secrets during maintenance.

## Rotation warning

Changing `TOKEN_ENCRYPTION_KEY` without a migration makes the existing encrypted Spotify store unreadable. Plan a controlled reauthorization or decrypt/re-encrypt migration first. Changing the MCP client secret prevents future exchanges; deleting the OAuth store is required for full session invalidation.

## Logs and upgrades

Logs contain paths, statuses, latency, retry counts, and sanitized excerpts. Treat them as sensitive because paths can reveal account activity. For upgrades, back up `/data`, run all quality checks in a clean checkout, deploy the new artifact, verify health/metadata/tools, then perform one read-only Spotify call before testing writes.

Playlist analysis, transfer, personalization, chapters, snapshots and
verification share the provider-neutral `PlaylistStateReader`. It returns the
resolved provider/connection, complete ordered items, revision, cache
provenance and provider-call metrics. Offset pages use bounded concurrency;
cursor pages remain sequential. A revision change during a parallel read is
reported as stale rather than silently used for a mutation.

The admin Jobs page uses the durable job repository and supports CSRF-protected
cancel/resume actions where the job state permits them. Destructive browser
actions use a native dialog when JavaScript is available and a server-rendered
confirmation fallback when it is not.
