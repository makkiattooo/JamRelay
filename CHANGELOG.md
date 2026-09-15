# Changelog

All notable changes to JamRelay are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Reliability and security hardening

- Serialized encrypted credential-store mutations across all instances sharing a file path.
- Added bounded, cancellable concurrency for YouTube playlist writes.
- MCP handlers now await lifecycle completion and propagate disconnect cancellation.
- Durable job shutdown drains active work before closing SQLite.

## [1.2.0] - 2026-09-14

### Highlights

JamRelay is now a provider-neutral music automation MCP server. Spotify remains
fully supported as an adapter, while SoundCloud, Apple Music, and YouTube use
their own authentication and capability boundaries.

### Multi-provider architecture

- Provider Registry, Provider Connection, connection IDs, capabilities, and
  canonical tracks/provider mappings.
- Multiple connections per provider with fail-closed write targeting.
- Zero-provider bootstrap and provider-neutral server health.

### Providers

- Spotify adapter for catalog, playlists, library, playback, and history.
- SoundCloud identity, catalog, and playlist adapter.
- Apple Music Developer Token/Music User Token integration.
- Official YouTube Data API playlist/video adapter with quota-aware behavior.
- TIDAL remains feasibility-only and is not implemented.

### Interoperability and automation

- Canonical resolver, provider-neutral import/export, and cross-provider
  transfer planning/execution.
- Playlist snapshots, verification, undo, durable jobs, rate-limit diagnostics,
  duration-based automation, and persisted playlist chapters.

### Authentication and security

- Connection Hub, owner sessions, MCP OAuth, per-connection grants and
  permissions, encrypted provider credentials, and separated auth boundaries.
- Destructive and write operations fail closed for missing or ambiguous targets.

### Persistence and documentation

- Provider-aware state, snapshots, resolver attempts, connection-scoped errors
  and rate limits, canonical listening history, and chapter persistence.
- New provider, deployment, security, transfer, import/export, chapter, and
  release documentation.

### Breaking / behavioral changes

- Spotify is no longer required at startup.
- Writes must resolve an explicit or unique capable connection.
- Provider credentials use the encrypted provider credential store rather than a
  Spotify-only runtime path.
- Provider capabilities and identity semantics differ; Spotify IDs are not
  universal track IDs.

### Upgrade notes

Back up the database, provider credential store, MCP OAuth store, and secrets.
Run `npm ci && npm run check`; startup applies forward migrations automatically.
The migration chain has no automatic down migration. See [the 1.2.0 release
guide](docs/release-1.2.0.md).

### Known limitations

Real-provider OAuth, quota behavior, playback, and third-party MCP client
compatibility require manual verification. Apple Music Music User Tokens must
be obtained through a client context. TIDAL has no runtime adapter.

## [Unreleased]

- Follow-up work will be documented here without changing the 1.2.0 record.

- Release-engineering validation for provider-neutral routing, Connection Hub,
  MCP connection/permission grants, migrations, backup/rollback procedures and
  deployment compatibility.
- Manual provider credentials remain required before production readiness is
  declared.

## [1.1.0] - 2026-09-13

JamRelay v1.1.0 is the largest update since the initial public release.

This release turns JamRelay from a relatively thin provider bridge into a
stateful, self-hosted music automation platform with persistent local state,
database-first track resolution, durable jobs, playlist planning and safety,
rules and recipes, personalization, local history, stronger diagnostics,
production migration management, and substantially improved deployment tooling.

### Added

#### Stateful application database

- Persistent SQLite State DB.
- Canonical track storage and normalized aliases.
- Resolver attempt history.
- Persisted Spotify API errors and rate-limit state.
- Durable jobs and per-item job state.
- Playlist snapshots and operation records.
- Persistent playlist recipes.
- Locally observed listening events.
- Persistent playlist rotation definitions.
- WAL mode, foreign-key enforcement and bounded busy timeout.

#### Database migrations

- Forward-only SQL migration management.
- Automatic startup migrations.
- Transactional migration application.
- `schema_migrations` registry.
- SHA-256 migration checksums.
- Verification of previously applied migrations.
- Detection of missing, modified and duplicate-prefix migrations.
- Schema states: `current`, `ahead`, `behind`, `unknown`.
- `npm run db:migration:new` migration generator.
- Migration integrity tests.

v1.1.0 ships:

- `0001_state_db.sql`
- `0002_playlist_engine.sql`
- `0003_playlist_recipes.sql`
- `0004_personalization_history.sql`

#### Database-first track resolution

- Persistent `TrackResolver`.
- Normalized title/artist/album resolution.
- Local canonical and alias lookup before Spotify Search.
- Immediate local return on cache hits.
- Canonical track indexing from Spotify responses.
- Verified alias persistence.
- Ambiguity handling.
- Confidence/provenance tracking.
- Passive canonical-state warming.
- Resolver diagnostics.
- Optional alternate resolver fallback.
- Spotify validation of alternate candidates.
- Rate-limit-aware lookup behavior.

#### Durable jobs

- Persisted bulk jobs.
- Per-item progress.
- Resume after restart.
- Explicit commit.
- Cancellation without history loss.
- Interrupted-job recovery.
- Retry accounting.
- Rate-limit-aware pausing and continuation.
- Protection against blindly repeating uncertain external writes.
- Expanded regression tests.

#### Rate limits and diagnostics

- Persisted Spotify rate-limit state.
- Provider/operation scoping.
- `Retry-After` handling.
- First/last occurrence and occurrence counts.
- Preflight checks before unnecessary requests.
- Request IDs.
- Structured HTTP errors.
- Normalized Spotify API errors.
- Persistent error fingerprints.
- Recent API-error inspection.
- State diagnostics.
- Secret-aware logging.

#### Smart playlist engine

- Normalized playlist-track models.
- Serializable operation plans.
- Playlist health analysis.
- Duration analysis.
- Artist and album concentration.
- Adjacent-artist repetition detection.
- Exact duplicate analysis.
- Conservative semantic duplicate detection.
- Unavailable-item detection.
- Deterministic seeded smart shuffle.
- Artist and album spacing.
- Artist balancing.
- Artist-share limits.
- Smart insertion.
- Playlist optimization.
- Filtering.
- Duration-based trimming and extension.
- Partial replacement.
- Freshening.
- Smart merge and balanced split.
- Clone and sync.
- Artist extraction, movement, removal and replacement.
- Bulk playlist editing.
- Playlist comparison.
- Operation-cost estimation.
- Integrity verification.

#### Playlist safety

- Dry-run-first behavior for smart mutations.
- Safety snapshots.
- Before/after snapshots.
- Deterministic plans and fingerprints.
- Post-write verification.
- Snapshot restoration.
- Undo for supported JamRelay-managed operations.
- Explicit partial-result reporting.

High-level lifecycle:

`ANALYZE → PLAN → DRY RUN → SNAPSHOT → EXECUTE → VERIFY → RECORD`

#### Rules and recipes

- Deterministic typed playlist rules.
- Reusable playlist constraints.
- Persistent recipes.
- Recipe versioning.
- Recipe execution through the shared playlist engine.

#### Listening history and personalization

- Persistent locally observed listening events.
- Event provenance/source/type.
- Playback progress and duration metadata.
- Session IDs and supporting evidence.
- History ingestion/querying.
- Deterministic local affinity scoring.
- Personal-affinity ranking and sorting.
- Playlist personalization.
- Recently-played avoidance.
- Rediscovery and deep-cuts workflows.
- Missing-favorites analysis.
- Artist-collection completion.
- Skip evidence and skip-pattern reports.
- Separation of observed facts from derived signals.

#### Sessions, mixes and rotations

- Deterministic session planning.
- Playlist-based session queues.
- Duration and track-count targets.
- Artist-gap constraints.
- Smart-next selection.
- Daily mix workflows.
- Weekly rotations.
- Persistent rotation definitions.
- Manual/daily/weekly cadence metadata.
- Next-due, last-planned and last-completed state.

#### Library workflows

- Liked-track synchronization.
- Inbox-style playlist workflows.
- Playlist archival.
- Playlist versioning.
- Richer playlist comparison.

#### MCP surface

- Expanded runtime registry to **103 MCP tools**.
- Added state, job, resolver, diagnostic, automation, history and personalization tools.
- Added higher-level tools that encapsulate complete workflows instead of forcing clients to coordinate every low-level Spotify write.
- Preserved core search, playlist, library and playback tools.
- Kept `get_artist_top_tracks` registered for compatibility while reporting the removed Spotify feature.

#### Deployment and container runtime

- Dedicated VPS deployment workflow.
- Optional full local lint/test validation.
- Local build validation.
- Deployment tarballs.
- SSH/SCP project upload.
- Differential asset synchronization.
- Docker Compose validation.
- Production image builds.
- Deployment locking.
- Controlled container replacement.
- Cloudflare Tunnel lifecycle handling.
- Docker/local/public health verification.
- Schema-version verification.
- Rollback image preservation.
- Automatic rollback after failed rollout.
- Persistent external data volume.
- Internal Docker network.
- Migrations shipped inside the production image.
- `/data` persistent state.
- Non-root execution.
- Read-only root filesystem.
- Dropped Linux capabilities.
- `no-new-privileges`.
- Writable `/tmp`.

#### OAuth and branding

- Branded JamRelay MCP authorization page.
- JamRelay-specific OAuth assets.
- Improved multi-client OAuth behavior.
- Continued PKCE and RFC 7591 DCR support.
- Continued public/confidential OAuth clients.
- Optional static Bearer auth.
- Complete JamRelay visual identity.
- Dark/light logos and icons.
- WebP exports.
- Browser/PWA icons.
- Open Graph and X card artwork.
- ChatGPT plugin artwork.
- Brand asset documentation.

#### Documentation and development workflow

- Repositioned docs around self-hosted music automation.
- Added database-first resolution docs.
- Added playlist automation, safety, rules and personalization docs.
- Added State DB documentation.
- Expanded errors, OAuth, deployment and client docs.
- Expanded generated MCP tool and environment references.
- Improved translation metadata/hash tooling.
- Added Husky pre-push checks.
- Expanded database, jobs, MCP, OAuth, Spotify-response and runtime tests.
- Added stricter `npm run release:check`.

#### Contribution and licensing

- Added `CLA.md`.
- Expanded `CONTRIBUTING.md`.
- Added `LICENSING.md`.
- Changed the project license to **AGPL-3.0-only**.

### Changed

- Renamed project/runtime identity to **JamRelay** across code, docs, configuration, deployment paths and environment variables.
- Consolidated production naming and removed obsolete historical aliases where appropriate.
- Repositioned JamRelay from a Spotify MCP bridge into a stateful music automation layer.
- Moved complex playlist behavior into reusable domain services.
- Made persistent local state a first-class architectural component.
- Made planning, verification, provenance and reversibility core design principles.
- Improved Spotify response/error handling.
- Improved pagination and bounded writes.
- Reduced repeated Spotify Search usage through DB-first resolution.
- Expanded `/health` with database readiness and schema version/state.
- Simplified docs navigation and reduced localized duplication.

### Fixed

- Cross-platform documentation checks.
- Docker Compose healthcheck behavior.
- Husky pre-push hook path.
- Durable-job state and retry edge cases.
- Dry-run job completion behavior.
- Duplicate migration-prefix validation.
- API error propagation.
- Rate-limit handling.
- Project naming inconsistencies.
- Production URL references.
- MCP/OAuth regression coverage.

### Security

- Switched from MIT to **GNU Affero General Public License v3.0 only (`AGPL-3.0-only`)**.
- Added explicit licensing documentation.
- Improved secret-aware logging/error handling.
- Preserved encrypted Spotify token persistence.
- Hardened production containers with non-root execution, dropped capabilities, read-only root filesystem and `no-new-privileges`.
- Kept persistent state outside public web roots and ephemeral container storage.

### Upgrade notes

Existing v1.0.0 installations should review:

- JamRelay environment variable names,
- persistent `/data` storage,
- Docker Compose configuration,
- public MCP base URL,
- OAuth client configuration,
- historical TuneLink-era paths or deployment identifiers.

Database migrations are applied automatically at startup.

Do not edit migration files after they have been applied to shared or production storage.

After upgrade, `/health` should report the latest migration as both
`schemaVersion` and `expectedVersion`, with:

```json
{
  "schemaState": "current"
}
```

Production deployments should use persistent storage for `/data`.

---

## [1.0.0] - 2026-09-12

Initial public release of JamRelay.

### Added

- Spotify OAuth integration with encrypted token persistence.
- MCP Streamable HTTP transport.
- Bearer authentication.
- MCP OAuth 2.0 Authorization Code + PKCE.
- Static and multi-client OAuth configuration.
- RFC 7591 Dynamic Client Registration.
- RFC 9728 protected-resource discovery for `/mcp`.
- Spotify search, playlist, library, discovery and playback tools.
- Docker / Docker Compose deployment.
- Cloudflare Tunnel guidance.
- Multilingual VitePress documentation.
- Generated MCP tool/environment references.
- Documentation validation tooling.
- Free/low-cost hosting guidance.
- Client documentation for ChatGPT, Claude, Gemini CLI, Cursor, VS Code, Windsurf and MCP Inspector.
- End-to-end verified ChatGPT MCP OAuth integration.

### Changed

- Centralized documentation navigation.
- Added translation freshness metadata.
- Removed the assumption that local Node token storage lives under system `/data`.
- Allowed MCP OAuth to be fully disabled while rejecting partial legacy-client configuration.
- Made static `MCP_API_KEY` authentication respect `MCP_AUTH_MODE`.
- Pruned expired MCP OAuth records.
- Stopped silently resetting unreadable OAuth stores.
- Improved issuer information and DCR callback validation.

[1.1.0]: https://github.com/makkiattooo/JamRelay/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/makkiattooo/JamRelay/releases/tag/v1.0.0
