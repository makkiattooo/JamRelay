# Public release audit

Date: 2026-09-15

## Release status

JamRelay v1.3.0 is the current release candidate.

The repository includes automated coverage for the provider-neutral runtime, authorization boundaries, playlist state handling, durable jobs, backup logic, Admin Console security, concurrency and request lifecycle behavior.

Production readiness still requires the manual provider, deployment and MCP client checks listed in `docs/deployment/release-candidate.md`.

The final release gate remains:

```bash
npm ci
npm run check
```

A release must not be marked production-ready solely because individual lint, typecheck, unit-test or build commands pass separately.

## Verified technical scope

The automated suite covers, among other areas:

- Spotify, SoundCloud, Apple Music and YouTube adapter behavior;
- provider-neutral routing and connection targeting;
- granular provider playlist capabilities;
- canonical mappings and cross-provider transfer behavior;
- complete playlist pagination;
- provider-neutral playlist state acquisition;
- playlist mutation safety behavior;
- revision-aware playlist cache behavior;
- request-scoped singleflight;
- bounded concurrency;
- encrypted provider credential persistence;
- concurrent credential-store mutation regression coverage;
- request cancellation and lifecycle propagation;
- durable job recovery and controlled concurrency;
- rate-limit-aware waiting behavior;
- application-aware backup behavior;
- MCP Streamable HTTP transport;
- static Bearer authentication;
- MCP OAuth Authorization Code + PKCE S256;
- RFC 9207 `iss` authorization responses;
- RFC 9728 protected-resource metadata;
- pre-registered confidential/public OAuth clients;
- static multi-client registry;
- RFC 7591 Dynamic Client Registration for deployed-client compatibility;
- owner approval before authorization-code issuance;
- rotating refresh tokens and expiring access tokens;
- connection-scoped MCP grants and permissions;
- declarative MCP tool authorization metadata;
- Admin Console authentication and CSRF boundaries;
- Admin Console secret-canary rendering tests;
- Docker/Compose deployment configuration;
- generated MCP tool and environment references;
- multilingual VitePress documentation and translation freshness checks.

## Manual verification required

Automated tests do not prove the behavior of real external accounts and hosted clients.

The release owner must still manually verify, where applicable:

- live Spotify OAuth;
- live SoundCloud OAuth;
- Apple Music Developer Token and Music User Token behavior;
- YouTube OAuth and quota behavior;
- real playlist writes;
- real playback devices;
- provider-specific rate limits;
- production reverse proxy behavior;
- Cloudflare Tunnel deployment;
- production graceful shutdown;
- production backup creation and recovery procedure;
- hosted MCP clients such as ChatGPT, Claude, Gemini CLI, Cursor, VS Code/Copilot and Windsurf.

These remain `MANUAL VERIFICATION REQUIRED`.

## Admin Console security

The Admin Console must never expose provider access tokens, provider refresh tokens, Apple Music Music User Tokens, provider client secrets, MCP access/refresh tokens, MCP API keys, owner secrets, `TOKEN_ENCRYPTION_KEY` or raw encrypted credential payloads.

Admin rendering uses safe view data and dedicated regression tests include secret-canary values intended to fail if credential-like data reaches rendered HTML.

## Credential persistence

Provider credentials remain encrypted at rest.

Concurrent in-process credential mutations are serialized so multiple provider auth flows cannot silently overwrite unrelated credential records stored in the same credential file.

The deployment model remains single-process/single-writer unless explicitly documented otherwise.

The encryption key is required for credential recovery and must be backed up separately from ordinary application data.

## State and backups

JamRelay continues to use SQLite as its local application state database.

Forward migrations remain application-owned and forward-only.

The repository now provides an application-aware backup workflow:

```bash
npm run backup
```

Operators must still preserve deployment secrets and `TOKEN_ENCRYPTION_KEY` separately.

A backup is not considered operationally useful until its restore procedure has been tested for the target deployment.

## Provider model

Spotify, SoundCloud, Apple Music and YouTube remain separate provider adapters.

Their capability surfaces are intentionally not assumed to be identical.

Unsupported provider operations must fail before unsafe provider I/O wherever the capability model can determine that the operation is unavailable.

TIDAL remains feasibility-only and is not implemented.

## Client verification language

No third-party MCP client should be described as manually verified against this exact release unless it was actually tested against the final v1.3.0 release candidate.

Protocol integration tests do not replace live compatibility checks.

## Documentation maintenance model

- English is canonical.
- Polish is high priority.
- German, French and Spanish are best effort.
- Fast-changing tool/environment references are generated.
- Sidebar/navigation structure is declared once.
- Selected translated pages record the hash of the English source they were reviewed against.
- `npm run docs:check` may warn when English content has changed after a translation review.
- A non-English page may legally lag behind English; the documentation should say so explicitly.

## Secrets and generated data

Do not commit `.env`, provider credential stores, MCP OAuth token stores, Cloudflare credentials, production callback secrets, encryption keys, runtime `/data` or production backups containing private state.

Public example files must contain placeholders only.

## Public-name note

The repository currently uses the public name **JamRelay**.

This audit does not perform trademark clearance or guarantee name uniqueness. That remains a release-owner branding decision rather than a code-quality gate.

## Final release procedure

Run from a clean checkout:

```bash
npm ci
npm run check
```

Then perform the applicable manual provider, deployment and MCP-client checks in `docs/deployment/release-candidate.md`.

Only after both automated and required manual checks are complete should the release owner create the final `v1.3.0` tag and mark the release production-ready.
