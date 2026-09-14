# JamRelay 1.2.0

Version 1.2.0 is the provider-neutral architecture release. JamRelay now
models music services as independent provider connections behind shared
canonical entities and capability-aware services.

## What changed

- Spotify, SoundCloud, Apple Music, and YouTube adapters with intentionally
  different capability surfaces;
- Connection Hub, owner sessions, MCP OAuth grants, connection ACLs, and
  explicit write targeting;
- canonical track mappings and cross-provider transfer planning/execution;
- provider-neutral playlist import/export and persisted playlist chapters;
- durable jobs, snapshots, verification, undo, connection-scoped diagnostics,
  and rate limits;
- provider-neutral health: a deployment is healthy with zero connected
  providers.

## Upgrade

Back up the SQLite database, encrypted provider credential store, MCP OAuth
store, and deployment secrets. Run `npm ci` and `npm run check` from the
release checkout, then deploy using the repository's VPS or Compose procedure.
Startup applies forward migrations automatically. The migration chain is not
automatically reversible; application rollback does not undo an already-applied
database migration.

The active credential path is `PROVIDER_CREDENTIAL_STORE_PATH`. Do not assume
the former Spotify-only token path is an active runtime store; explicitly
import or recreate credentials according to the provider connection procedure.

## Boundaries

Provider capabilities are not identical. Apple Music requires a Music User
Token for user-scoped actions, YouTube entries are videos, and TIDAL remains
feasibility-only. Live provider OAuth, quotas, callbacks, and MCP client
compatibility require manual verification with real credentials.
