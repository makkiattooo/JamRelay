---
title: Release candidate checklist
---

# Release candidate checklist

This checklist documents the v1.2.0 multi-provider release. Automated gates use
mock providers and do not replace manual provider verification.

## Backup before upgrade

Stop writes or stop the service, then back up the complete persistent data
directory, including `jamrelay.db`, `jamrelay.db-wal`, and `jamrelay.db-shm` if
present. Back up the encrypted provider credential store, the MCP OAuth store,
the static OAuth client registry, `.env`/secret-manager entries, and the
`TOKEN_ENCRYPTION_KEY` separately. The encryption key is required to recover
provider credentials.

## Upgrade

1. Take and verify the backups above.
2. Deploy the new image or checkout with the same `/data` volume and unchanged
   secret configuration.
3. Allow application startup to run forward migrations.
4. Confirm `/health`, `database.schemaState`, and `/auth/status`.
5. Run a read-only MCP smoke test, then verify owner login and provider status.

The application owns migrations at startup. Deployment must not replace the
SQLite file or credential stores. SQLite migrations are forward-only; there is
no automatic down migration.

## Rollback

Rollback the application image only, keeping the forward-migrated database if
the older image reports it as compatible. Do not restore an old database over a
new one. If data restoration is unavoidable, stop the service, preserve the
current directory for investigation, restore the complete matching backup
directory and its encryption key, and validate before reopening writes.

## Manual verification required

| Provider    | Operation                        | Expected result                                                                                   |
| ----------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| Spotify     | OAuth                            | Callback completes, encrypted credentials persist, reconnect reuses the connection.               |
| Spotify     | Catalog/playlist reads           | Search and playlist reads return normalized data with provider and connection provenance.         |
| Spotify     | Playlist writes                  | Explicitly targeted writes succeed; ambiguous writes fail closed.                                 |
| Spotify     | Playback                         | Playback works only when the account/device/provider capability allows it.                        |
| SoundCloud  | Auth and identity                | OAuth completes and the expected account is shown in Connection Hub.                              |
| SoundCloud  | Search and playlist reads/writes | Supported operations succeed; unsupported operations return `CAPABILITY_UNAVAILABLE`.             |
| Apple Music | Developer/User Token flow        | Tokens remain separate and supported library operations work; unsupported operations fail closed. |
| YouTube     | OAuth and owned playlists        | OAuth persists encrypted credentials; playlist/video operations respect quota and ownership.      |

For every row, also verify disconnect retains local state, revocation blocks
the connection, and MCP grants cannot access an unselected connection.

Additional deployment checks:

- reverse proxy HTTPS, `PUBLIC_BASE_URL`, forwarded headers and `TRUST_PROXY`;
- backup restore and graceful shutdown in the target deployment.
- reverse proxy HTTPS, `PUBLIC_BASE_URL`, forwarded headers and `TRUST_PROXY`;
- backup restore and graceful shutdown in the target deployment.
