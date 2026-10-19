# Operations

JamRelay 1.4.0 uses local operator commands, MCP tools and OAuth consent pages. There is no web administration interface. Run commands from the repository as the service user; `npm run operator` loads `.env` when present. A compiled installation can use `node --env-file-if-exists=.env dist/operator.js` without development dependencies.

## Local operator commands

```bash
npm run operator -- status
npm run operator -- connections list
npm run operator -- clients list --json
npm run operator -- clients revoke CLIENT_ID
npm run operator -- jobs list
npm run operator -- jobs inspect 123
npm run operator -- jobs cancel 123
npm run operator -- jobs resume 123
npm run operator -- diagnostics
npm run operator -- backup create
npm run operator -- backup list
```

Exit status is 0 on success, 2 for invalid command syntax and 1 for operational errors. JSON output is available with `--json`; ordinary output is indented JSON. Inspection deliberately omits arbitrary job payloads and credentials. Lists are bounded. `connections list` needs the existing encryption key and reports stored credential-record IDs, not live provider connectivity.

`clients revoke` persists an SQLite revocation overlay, immediately checked even by an already running OAuth server. It never races an edit of the single-writer OAuth JSON file. Reauthorizing with owner consent establishes a new grant and new tokens; old revoked tokens remain blocked. Use the consent screen to change permissions or connections; an ordinary MCP client cannot grant itself access. The separately configured static bearer API key represents the operator and is not an OAuth client grant.

## Jobs and recovery

MCP clients use `create_bulk_job`, `list_jobs`, `get_job_status`, `resume_job`, `commit_job` and `cancel_job`. A client can inspect and control only jobs it created and only within its current connection grants. Legacy jobs without a recorded client owner remain available to the local operator, not arbitrary MCP clients. Bulk job types are `bulk_add_tracks`, `add_tracks_by_search`, and `create_playlist_from_tracks`.

Jobs resolve items in ordered bounded batches using their original provider and connection. Read failures back off exponentially (1 second initial, 5 minute cap, up to 25% jitter); HTTP 429 persists a connection-scoped cooldown without consuming attempts. `resume` cannot bypass a cooldown. Pending/waiting cancellation prevents claiming; running cancellation is checked between operations. An already issued external request may still complete.

A ready job needs an explicit `commit_job`. Commit reservation is atomic and automatic writes are at most once per job. A completed commit returns its stored result when requested again. Connection/capability validation fails closed. There is no exactly-once guarantee across a provider API and SQLite.

After restart, interrupted reads resume from durable progress. Reserved/interrupted commits become failed with manual review required. A cancelled in-flight commit retains cancellation and manual-review information. Neither the runner nor `resume` will replay these writes. Inspect the provider playlist and the local database/recorded results during maintenance; reconcile manually, then create a new job for only the work proven missing. Never clear a reservation simply to retry an uncertain write.

## Health and shutdown

`GET /health` is public and reports readiness and version without connection identities. Use local `status` / `diagnostics` or a granted MCP read for detailed operational checks. A healthy process does not prove provider authorization.

SIGTERM/SIGINT stops new claims, aborts cooperative work and drains HTTP operations before closing SQLite. Shutdown keeps uncertain commits reserved for startup recovery. Use one server process per credential directory; competing SQLite claim safety is not multi-replica support for OAuth files.

## Backups and restore

`backup create` writes a SQLite-consistent snapshot plus existing encrypted credentials and MCP OAuth files under `${JAMRELAY_DATA_DIR}/backups/<timestamp>`. Files are private and include a manifest. Backups contain sensitive encrypted and OAuth state; protect the directory. The encryption key and `.env` are excluded: keep the matching key separately. `npm run backup -- --output <new-directory>` remains available.

For a coherent snapshot across the separate JSON stores and SQLite, stop the service before a full application backup. Restore only with the service stopped; restore matching files and configuration with restrictive ownership, then start and inspect `status`. Do not combine unrelated installations or delete the job database to repair OAuth.

## Upgrade from 1.3.0

1. Stop the service and create a protected backup of its data and matching configuration.
2. Install 1.4.0 dependencies, build, and start with the existing data paths and encryption key.
3. Startup applies immutable forward migration `0012_durable_queue.sql`. Do not edit migrations 0001–0011.
4. Set `MCP_OAUTH_OWNER_SECRET` before provider authorization. Sign in at `/owner/login`, then open the provider start URL and explicitly approve the exact connection/replacement.
5. Replace obsolete web-management/status calls with the CLI. See [endpoints](/endpoints).
6. Review old/uncertain jobs locally. Existing credentials, playlists, grants and item history are retained.

Rollback requires the pre-upgrade backup and matching application/configuration. Older queue code does not honor the new reservation and cancellation fields, even if it can read a forward schema. Do not run a 1.3 worker against a database used by 1.4.
