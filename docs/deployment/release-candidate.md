---
title: Release candidate checklist
---

# Release candidate checklist

This checklist documents the JamRelay v1.3.0 release candidate.

Automated gates use mocked providers and controlled fixtures. They do not replace manual verification against real provider accounts, production deployment infrastructure or hosted MCP clients.

## 1. Create and verify a backup

Before upgrading production, create an application-aware backup:

```bash
npm run backup
```

Also preserve separately:

- `TOKEN_ENCRYPTION_KEY`;
- deployment `.env` or secret-manager configuration;
- provider server credentials;
- MCP OAuth static client configuration where used;
- Cloudflare Tunnel credentials where used.

The encryption key is required to recover encrypted provider credentials.

Do not store the encryption key inside an ordinary application backup archive.

## 2. Run the release gate

From a clean checkout:

```bash
npm ci
npm run check
```

Do not treat separate successful `lint`, `typecheck`, `test` and `build` commands as equivalent to the complete release gate.

If the documentation build fails only because of a known local sandbox or filesystem-policy limitation, rerun the complete release gate in a normal filesystem environment such as CI or the deployment host before tagging the release.

## 3. Upgrade

1. Take and verify the backup.
2. Deploy the new image or checkout with the same persistent `/data` volume.
3. Keep the existing encryption key and deployment secrets.
4. Allow startup to apply forward migrations.
5. Confirm `/health`.
6. Confirm database schema state is `current`.
7. Open the Admin Console.
8. Verify provider connection status.
9. Verify MCP client grants.
10. Perform a read-only MCP smoke test.
11. Only then test provider writes.

SQLite migrations remain forward-only; application rollback does not automatically reverse an already-applied database migration.

## 4. Admin Console verification

Verify:

- owner login and logout;
- CSRF protection on state-changing actions;
- Overview without provider API storms;
- Connections and connection details;
- preferred read/write controls;
- provider disconnect behavior;
- MCP Clients and grants;
- Jobs and job details;
- supported cancel/resume actions;
- Diagnostics and rate-limit state;
- Tools and System Status;
- backup-related UI does not expose `TOKEN_ENCRYPTION_KEY`.

Inspect page source during at least one production-like check and confirm no provider tokens, MCP tokens or deployment secrets are present.

## 5. Provider verification

| Provider    | Operation                       | Expected result                                                                          |
| ----------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| Spotify     | OAuth                           | Callback completes, encrypted credentials persist and reconnect reuses the connection.   |
| Spotify     | Catalog and playlist reads      | Reads return normalized data with provider and connection provenance.                    |
| Spotify     | Large playlist read             | Full playlist is returned and pagination does not truncate after the first page.         |
| Spotify     | Playlist writes                 | Explicitly targeted writes succeed and ambiguous writes fail closed.                     |
| Spotify     | Playback                        | Playback works only when account, device and provider capability allow it.               |
| SoundCloud  | Auth and identity               | OAuth completes and the expected account appears in the Connection Hub.                  |
| SoundCloud  | Catalog and playlist operations | Supported operations succeed and unsupported operations fail with a capability error.    |
| Apple Music | Developer/User Token flow       | Tokens remain separate and supported library operations work.                            |
| Apple Music | Unsupported playlist operations | Unsupported granular operations fail before unsafe provider I/O.                         |
| YouTube     | OAuth                           | OAuth persists encrypted credentials and concurrent reads do not create a refresh storm. |
| YouTube     | Owned playlists                 | Playlist/video operations respect provider capabilities and quota behavior.              |
| YouTube     | Bulk playlist work              | Concurrency remains bounded and ordering behavior remains correct.                       |

For every provider also verify disconnect/revocation behavior, grant isolation and that credential material does not appear in logs or Admin Console HTML.

## 6. Playlist workflow verification

Use at least one playlist larger than a single provider page.

Verify complete state reads, correct cache/revision behavior, safety snapshots, deterministic ordered writes, full-result verification, fail-closed capability checks, cancellation and rate-limit backpressure.

For cross-provider transfer also verify complete destination state and complete source planning.

## 7. Durable jobs verification

Verify per-item progress, bounded concurrency, resume after restart, valid cancellation, rate-limit waiting, graceful shutdown and protection against blindly repeating uncertain external writes.

## 8. Backup verification

Create a backup using:

```bash
npm run backup
```

Verify the backup succeeds, resulting SQLite state opens correctly, credential storage follows the documented backup model, the encryption key is not silently embedded and restore documentation matches the generated layout.

## 9. MCP authorization verification

Verify read-only grants cannot mutate providers, destructive operations require destructive permission, connection grants remain isolated, provider/connection conflicts fail closed, transfer requires destination grants and every registered tool has explicit authorization metadata.

## 10. Deployment checks

Verify reverse proxy HTTPS, `PUBLIC_BASE_URL`, forwarded headers, `TRUST_PROXY`, Cloudflare Tunnel where used, `/health`, Admin Console, MCP endpoint, database schema state, persistent `/data`, graceful shutdown, container restart, backup creation, restore procedure and rollback behavior.

## Rollback

Application rollback is not database rollback.

If the previous image remains compatible with the current forward-migrated database, roll back the application image while preserving the current persistent state.

Do not overwrite a newer database with an older backup merely because an application image was rolled back.

If data restoration is unavoidable, stop JamRelay, preserve the current state directory, restore one complete matching backup and matching encryption key, validate the restored state, verify owner login/provider status and reopen writes only after validation.

## Release approval

A v1.3.0 release candidate is ready for tagging only when:

- `npm ci` succeeds;
- `npm run check` succeeds in a normal release environment;
- required live-provider checks are complete;
- production-like MCP authentication is verified;
- Admin Console security checks are complete;
- backup and restore procedures are verified;
- no unresolved release-blocking regression remains.
