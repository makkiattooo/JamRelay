# JamRelay 1.4.0 development candidate

This is a source candidate, not a published release or a production deployment.

## Changes

Provider authorization now requires owner login and explicit consent for the exact provider/default connection, including replacement. One-time expiring initiation records bind callbacks to the owner session in addition to provider state and existing PKCE verification. Provider tokens remain encrypted, and MCP OAuth remains a separate consent and authorization protocol.

The existing SQLite queue now uses atomic claims, explicit typed executors, provider/connection routing, durable retry/cooldown, cancellation guards and atomic external-commit reservation/finalization. Partial writes retain ordered chunk progress and pre-write snapshot or created-playlist evidence. Uncertain outcomes require manual recovery; external APIs do not offer exactly-once execution.

The complete web management application is removed. Its templates, routes, CSS, JavaScript and view-only tests are deleted. Local operator commands replace privileged operations; MCP clients retain the six queue tools under client/connection ACLs. Public connection inventories and obsolete owner-management routes are removed.

## Upgrade and compatibility

Follow [operations](/operations) before installing. Keep existing data paths and the encryption key. Startup applies forward migration `0012_durable_queue.sql`; migrations 0001–0011 are unchanged. Existing playlists, credentials, grants and job-item history remain intact. Legacy unowned jobs are available only to the local operator. Old worker code must not run against the upgraded queue database.

Configure `MCP_OAUTH_OWNER_SECRET`, log in at `/owner/login`, then explicitly approve `/auth/providers/<provider>/start`. Apple Music retains its owner-authenticated Music User Token mechanism. Web-management routes now return 404. The health response omits connection/account inventories; non-personal schema readiness remains available.

For operation use `npm run operator -- status`, `clients revoke CLIENT_ID`, the job commands, diagnostics and backups. Production builds can use `node --env-file-if-exists=.env dist/operator.js` without development dependencies. See [HTTP endpoints](/endpoints), [security](/security) and [SQLite state](/state-database).

## Validation and limits

Run `npm run check` for generated docs, formatting, lint, types, tests and builds, and `npm run smoke:local` for isolated HTTP/MCP/CLI/startup/shutdown smoke checks. Tests use temporary fixtures and mocked providers, not real accounts. Translated configuration/OAuth pages have freshness notices and canonical links while translation updates remain pending. Use one application writer per credential directory; a full application backup across separate JSON stores should be made with the service stopped.
