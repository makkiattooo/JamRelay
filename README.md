<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logos/jamrelay-logo-dark.png.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/logos/jamrelay-logo-light.png.png">
  <img src="assets/logos/jamrelay-logo-dark.png.png" alt="JamRelay" width="420">
</picture>

<br>

### Provider-neutral, self-hosted music automation through MCP.

Turn high-level requests into deterministic, inspectable and reversible music operations through MCP.

<br>

[![Release](https://img.shields.io/github/v/release/makkiattooo/JamRelay?display_name=tag&style=flat-square)](https://github.com/makkiattooo/JamRelay/releases/latest)
[![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.13.0-339933?style=flat-square&logo=node.js&logoColor=white)](package.json)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-6f42c1?style=flat-square)](docs/mcp-client.md)
[![Providers](https://img.shields.io/badge/providers-Spotify%20%7C%20SoundCloud%20%7C%20Apple%20Music%20%7C%20YouTube-6f42c1?style=flat-square)](docs/providers/)
[![M8ven Score](https://m8ven.ai/badge/mcp/makkiattooo-jamrelay-1qzbwr)](https://m8ven.ai/mcp/makkiattooo-jamrelay-1qzbwr?s=readme)

[Get started](docs/getting-started.md) Â·
[Documentation](docs/index.md) Â·
[MCP tools](docs/tools-reference.md) Â·
[Latest release](https://github.com/makkiattooo/JamRelay/releases/latest)

</div>

---

## Install and run (1.5.1 candidate)

Node.js **22.13+** is required. npm/GHCR publication is pending; the commands below apply after publication. Until then install the candidate tarball built with `npm pack`:

```bash
npm install -g ./jamrelay-1.5.1.tgz
# After publication: npm install -g jamrelay
jamrelay setup
jamrelay start
```

After publication, `npx jamrelay setup`, `pnpm dlx jamrelay setup` and `bunx jamrelay setup` use the same package. The executable needs **Node.js**, including when a package manager is Bun. No source checkout or TypeScript compilation is needed by installed users.

The terminal wizard creates private configuration, generates owner/encryption secrets, optionally configures any of the four providers, and initializes SQLite without resetting data. Providers need developer credentials and separate owner-approved account authorization. A zero-provider installation works. Keep your private configuration backed up: losing its encryption key makes encrypted credentials unrecoverable.

```bash
jamrelay --help
jamrelay doctor
jamrelay config
jamrelay connections list
jamrelay clients list
jamrelay clients revoke CLIENT_ID
jamrelay jobs list
jamrelay jobs inspect JOB_ID
jamrelay jobs cancel JOB_ID
jamrelay jobs resume JOB_ID
jamrelay diagnostics
jamrelay backup create
jamrelay backup list
```

Configuration uses platform user directories (XDG on Linux, Application Support on macOS, AppData on Windows). Existing `.env` deployments and environment path overrides are retained. `JAMRELAY_CONFIG_PATH` selects another private env file. `setup --yes` uses environment variables without prompts, through the same validation/persistence logic; do not put secrets in command arguments. After an interrupted process, installation locks expire within 30 seconds.

### CLI information (1.5.1 candidate)

```bash
jamrelay info
jamrelay update check --refresh
jamrelay update channel stable    # or beta
jamrelay changelog --latest
jamrelay notices --offline
jamrelay notifications enable     # disable to opt out
```

These commands work independently of the server, support `--json`, and use separate local preferences/cache. Updates check actual official npm/GitHub/GHCR publication; development builds are never advertised as published releases. No upgrade is executed automatically. Passive metadata checks are opt-in, human-terminal only; no credentials or telemetry are sent. Bundled release information/notices work offline and before the feed reaches `main`. See [CLI updates and notices](docs/cli-information.md) for commands, privacy, cache and the maintainer feed workflow.

### Docker

The repository's `compose.yml` builds the candidate locally; it needs no tunnel, external network or pre-created volume:

```bash
docker compose run --rm jamrelay setup
docker compose up -d
docker compose ps
docker compose logs -f jamrelay
```

SQLite, credentials and generated configuration persist in the `jamrelay_data` volume mounted at `/data`. The container runs as an unprivileged user. The host listener defaults to `127.0.0.1:5267`; set `JAMRELAY_PORT` for a different host port and use that port in the wizard's public URL. The internal listener stays on port 5267. Remote clients need an HTTPS reverse proxy and an appropriate `PUBLIC_BASE_URL`/trusted proxy configuration.

Standalone image use after `docker build -t jamrelay:local .`:

```bash
docker run --rm jamrelay:local --version
docker run --rm -it -v jamrelay_data:/data jamrelay:local setup
docker run --rm -p 127.0.0.1:5267:5267 -v jamrelay_data:/data jamrelay:local start
```

GHCR is prepared at `ghcr.io/makkiattooo/jamrelay:1.5.1`; the image is **not published yet**. The container workflow builds amd64/arm64 and publishes only on an intentional matching version tag or explicit workflow publish action; branch pushes do not trigger it.

### Connect an MCP client / upgrade

Setup displays the actual remote endpoint (default `http://localhost:5267/mcp`). Enter it in a remote MCP client, complete owner OAuth consent, and request `tools/list` to verify. Provider authorization starts at `/auth/providers/PROVIDER/start` after `/owner/login`; there is no web admin console. Read the owner secret locally from the private configuration when logging in; never share it with agents.

Upgrade from 1.4.0: stop the server, back up data plus private configuration, install the new package, then run `jamrelay doctor` and `jamrelay start`. Run from the old deployment directory once with `jamrelay config` to retain `.env` and make existing paths absolute; use `JAMRELAY_CONFIG_PATH` thereafter. Do not move data or regenerate keys. No new SQLite migration is required beyond 0012. Operator commands still work via `npm run operator -- ...` in a source checkout.

## What is JamRelay?

JamRelay is a **self-hosted, provider-neutral music automation engine** that connects MCP clients to independent music-provider connections through a stateful automation layer.

JamRelay can persist local state, resolve canonical tracks and provider mappings, analyze playlists, plan mutations, preview them, snapshot state, execute bounded changes, verify the result, resume jobs after restarts, transfer playlists across providers, import/export provider-neutral playlists, and derive local personalization signals from events it actually observed.

Supported adapters are Spotify, SoundCloud, Apple Music, and YouTube Data API.
They do not have identical capabilities. JamRelay also supports a valid
zero-provider installation; provider connectivity is not server health.

The goal is not to make an AI client manually coordinate hundreds of Spotify API requests.

The goal is:

```text
request
   â†“
analyze state
   â†“
build deterministic plan
   â†“
preview / dry run
   â†“
snapshot
   â†“
   execute bounded provider operations
   â†“
verify
   â†“
record state
```

JamRelay handles the automation layer in between.

---

## Why JamRelay?

### Music automation instead of API plumbing

High-level behavior lives in JamRelay rather than in an AI client's conversation context.

Examples include:

- smart playlist reordering,
- artist balancing and spacing,
- semantic deduplication,
- playlist merge/split/clone/sync,
- reusable rules and recipes,
- playlist personalization,
- session queue planning,
- recurring rotations,
- durable bulk operations.

### Plan before changing

Complex playlist mutations are designed around:

```text
ANALYZE â†’ PLAN â†’ DRY RUN â†’ SNAPSHOT â†’ EXECUTE â†’ VERIFY â†’ RECORD
```

Smart mutations use dry-run-first behavior where supported. JamRelay can preserve ordered playlist snapshots before a change and verify the resulting playlist afterwards.

### Database-first track resolution

JamRelay does not immediately call Spotify Search for every metadata lookup.

```text
metadata query
   â†“
normalize
   â†“
local canonical / alias lookup
   â”œâ”€â”€ hit  â†’ return local result
   â””â”€â”€ miss â†’ Spotify Search â†’ validate â†’ persist
```

Known tracks can resolve locally. Ambiguous or low-confidence matches are not blindly cached.

### Persistent local state

JamRelay stores durable application state in SQLite, including:

- canonical tracks and aliases,
- resolver attempts,
- API errors and rate limits,
- durable jobs,
- playlist snapshots and operations,
- playlist recipes,
- locally observed listening events,
- playlist rotations.

This is application state, not temporary chat memory.

### Explainable personalization

JamRelay does not claim to know Spotify's private recommendation model or a user's complete listening history.

Personalization is derived from evidence JamRelay actually has, with observed facts kept separate from derived scores.

---

## Core capabilities

| Area                     | Examples                                                                  |
| ------------------------ | ------------------------------------------------------------------------- |
| **Spotify access**       | Search, tracks, artists, albums, playlists, library, playback, devices    |
| **Track resolution**     | DB-first lookup, aliases, ambiguity handling, alternate resolver fallback |
| **Playlist analysis**    | Health reports, duration, concentration, duplicates, repetition           |
| **Playlist layout**      | Smart shuffle, artist balancing, artist/album gaps, smart insertion       |
| **Playlist cleanup**     | Exact/semantic dedupe, filters, artist limits                             |
| **Playlist composition** | Merge, split, clone, sync, extract, move, replace                         |
| **Safety**               | Dry runs, plans, snapshots, verification, restore, undo                   |
| **Automation**           | Rules, recipes, bulk operations, optimization                             |
| **State**                | SQLite persistence, migrations, diagnostics, error history                |
| **Jobs**                 | Durable execution, retry state, resume, cancel, commit                    |
| **History**              | Locally observed listening events with provenance                         |
| **Personalization**      | Affinity ranking, recent-play avoidance, rediscovery, deep cuts           |
| **Sessions**             | Session queues, duration targets, artist spacing, smart next              |
| **Rotations**            | Daily mixes, weekly rotations, persistent schedules                       |

The exact MCP surface is generated from the runtime registry.

See [`docs/tools-reference.md`](docs/tools-reference.md) for the canonical tool reference.

---

## Example: improve a playlist safely

A request such as:

> Improve this playlist without changing which songs are in it. Spread artists and albums out, preview the changes first, then verify the result.

can become:

```text
playlist health report
        â†“
deterministic optimization plan
        â†“
dry run
        â†“
safety snapshot
        â†“
apply ordering changes
        â†“
capture resulting state
        â†“
verify ordered playlist contents
```

The playlist engine can preserve the original track set while changing only the layout.

---

## Playlist automation

JamRelay's playlist engine works on normalized tracks and serializable operation plans.

### Analysis

- health reports
- duration
- artist/album concentration
- adjacent-artist repetition
- exact duplicate detection
- conservative semantic duplicate detection
- unavailable-item detection

### Layout

- deterministic seeded shuffle
- artist and album spacing
- artist balancing
- artist-share limits
- smart insertion
- affinity ordering

### Cleanup and composition

- exact/semantic deduplication
- typed filtering
- artist removal/replacement
- merge/split/clone/sync
- extract and move artist tracks
- duration-based trimming/extension

### Automation

- reusable typed rules
- persistent recipes
- optimization plans
- bulk editing
- recurring rotations
- daily and weekly playlist workflows

Read more in [Playlist automation](docs/playlist-automation.md).

---

## Safety model

Spotify writes are external network operations, not one cross-request ACID transaction.

JamRelay does not pretend otherwise.

Before supported complex mutations it can preserve ordered URIs, playlist metadata, Spotify snapshot identifiers when available and operation metadata. After writes, it can verify the actual resulting playlist.

If a multi-request operation partially fails, that partial state is surfaced explicitly.

Undo applies only to supported JamRelay-managed reversible operations.

See [Playlist safety, snapshots and undo](docs/playlist-safety.md).

---

## Database-first resolution

```mermaid
flowchart LR
    A[Metadata query] --> B[Normalize]
    B --> C[Canonical track + alias lookup]
    C -->|Hit| D[Return local result]
    C -->|Miss| E[Spotify Search]
    E --> F[Validate candidate]
    F --> G[Persist canonical track + alias]
    G --> D
```

Spotify responses can passively warm canonical state. When Spotify Search is rate-limited, cached matches remain available.

An optional alternate resolver may provide candidate Spotify IDs or URLs, but JamRelay validates accepted candidates against Spotify before treating them as canonical.

See [Database-first track resolution](docs/database-first-resolution.md).

---

## State database

JamRelay uses SQLite for durable local application state.

Forward-only SQL migrations are applied automatically at startup. Applied migrations are recorded with version, SHA-256 checksum, provenance and application timestamp, and are verified on future startups.

JamRelay rejects inconsistent migration histories instead of silently continuing.

The health endpoint exposes schema state:

```json
{
  "database": {
    "status": "ok",
    "schemaVersion": "0004_personalization_history.sql",
    "expectedVersion": "0004_personalization_history.sql",
    "schemaState": "current"
  }
}
```

See [State Database](docs/state-database.md).

---

## Source checkout (development)

### Requirements

- Node.js 22.13+ or Docker
- Spotify Developer application
- Spotify account
- callback URL you control

Some playback operations may require Spotify Premium and an active compatible device.

### Clone and install

```bash
git clone https://github.com/makkiattooo/JamRelay.git
cd JamRelay
npm ci
```

Create `.env`:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Configure at minimum:

```env
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
TOKEN_ENCRYPTION_KEY=
PUBLIC_BASE_URL=http://127.0.0.1:5267
```

Start:

```bash
npm run dev
```

Sign in at `http://127.0.0.1:5267/owner/login` using the configured owner secret, then approve the exact Spotify connection/replacement:

```text
http://127.0.0.1:5267/auth/providers/spotify/start
```

Check:

```text
npm run operator -- status
http://127.0.0.1:5267/health
```

Local MCP endpoint:

```text
http://127.0.0.1:5267/mcp
```

For remote deployments, expose the MCP endpoint through HTTPS and configure Bearer auth or MCP OAuth.

---

## MCP clients

JamRelay uses MCP Streamable HTTP and includes setup notes for:

- ChatGPT
- Claude
- Gemini CLI
- Cursor
- VS Code / Copilot
- Windsurf
- MCP Inspector

Automated MCP protocol tests cover the server surface. Live third-party client
verification remains a manual release-owner check for each target client.

See [Connect clients](docs/clients/index.md) and [MCP OAuth registration](docs/clients/oauth-compatibility.md).

---

## Authentication

JamRelay has two separate authorization boundaries:

### Spotify authorization

Spotify OAuth grants JamRelay permission to operate on the connected Spotify account.

### MCP client authorization

MCP auth controls which clients may access JamRelay.

Supported mechanisms include:

- OAuth 2.0 Authorization Code
- PKCE
- static OAuth clients
- multiple OAuth clients
- RFC 7591 Dynamic Client Registration
- public and confidential clients
- optional static Bearer auth

---

## Docker and deployment

JamRelay supports Docker and Docker Compose.

Persistent state lives under:

```text
/data
```

The recommended Compose file reuses the named `jamrelay_data` volume (override `JAMRELAY_VOLUME_NAME` when upgrading a differently named volume). The legacy VPS deployment script retains its existing app/tunnel topology via `compose.legacy.yml`; it is separate from the one-service installer and was not run for this candidate.

The production container is designed around:

- non-root execution,
- read-only root filesystem,
- dropped Linux capabilities,
- `no-new-privileges`,
- writable `/tmp`,
- persistent named storage.

The VPS deployment workflow includes local checks, build verification, tarball upload, Compose validation, image build, controlled replacement, schema verification, health-gated rollout, public endpoint checks and rollback support.

See:

- [Installation](docs/installation.md)
- [Operations](docs/operations.md)
- [Free hosting](docs/deployment/free-hosting.md)
- [Low-cost deployment](docs/deployment/budget-hosting.md)

---

## Development

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run docs:generate
npm run docs:check
npm run docs:build
```

Full verification:

```bash
npm run check
```

Release gate:

```bash
npm run release:check
```

---

## Documentation

The VitePress documentation is the primary technical documentation.

- [English](docs/index.md) â€” canonical
- [Polski](docs/pl/index.md) â€” high priority
- [Deutsch](docs/de/index.md) â€” best effort
- [FranÃ§ais](docs/fr/index.md) â€” best effort
- [EspaÃ±ol](docs/es/index.md) â€” best effort

Fast-changing references are generated from project sources with:

```bash
npm run docs:generate
```

---

## Architecture

```mermaid
flowchart LR
    A[MCP client] --> B[Transport + auth]
    B --> C[MCP tool layer]
    C --> D[Domain services]
    D --> E[Playlist engine]
    D --> F[Track resolver]
    D --> G[Jobs]
    D --> H[History + personalization]
    E --> I[(SQLite State DB)]
    F --> I
    G --> I
    H --> I
    E --> J[ProviderRegistry]
    F --> J
    G --> J
    J --> K[Provider adapters and APIs]
```

JamRelay's MCP tools are an interface to this architecture, not the architecture itself.

See [Architecture](docs/architecture.md).

The multi-provider execution, synchronization and release audit is documented in [Release audit](docs/release-audit.md).

---

## Privacy and security

JamRelay is self-hosted. By default, state such as OAuth data, canonical track mappings, playlist snapshots, job state, local history and derived personalization signals stays inside your deployment.

Do not expose JamRelay publicly without authentication.

Keep `.env`, client secrets, token stores, MCP secrets, `/data` and database backups outside version control and public web roots.

Use HTTPS for remote deployments.

See [SECURITY.md](SECURITY.md) and [Security documentation](docs/security.md).

---

## Contributing

Contributions are welcome.

Before submitting changes:

```bash
npm run check
```

Read:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CLA.md](CLA.md)
- [LICENSING.md](LICENSING.md)

---

## Releases

Latest release:

[**JamRelay v1.3.0 â€” Historical 1.3.0 release**](https://github.com/makkiattooo/JamRelay/releases/tag/v1.3.0)

Release notes:

- [JamRelay 1.4.0 development candidate](docs/release-1.4.0.md)
- [JamRelay 1.3.0](docs/release-1.3.0.md)
- [JamRelay 1.2.0](docs/release-1.2.0.md)

See [CHANGELOG.md](CHANGELOG.md) for the complete release history.
---

## License

JamRelay is licensed under the **GNU Affero General Public License v3.0 only (`AGPL-3.0-only`)**.

See [LICENSE](LICENSE) and [LICENSING.md](LICENSING.md).

---

## Disclaimer

JamRelay is an independent open-source project.

It is not affiliated with, endorsed by, sponsored by, or an official product of Spotify, OpenAI, Anthropic, Google, Microsoft, Cursor, Windsurf, or any other platform or vendor referenced by the project.

Spotify and other product names and trademarks belong to their respective owners.

---

<div align="center">

**Music automation you can run yourself.**

</div>

## 1.4.0 development candidate

Provider authorization now requires a short-lived owner login and explicit connection/replacement consent. The web management interface is removed. Use `npm run operator -- status`, `connections list`, `clients list`, `clients revoke CLIENT_ID`, `jobs list/inspect/cancel/resume ID`, `diagnostics`, and `backup create/list` for local operation. MCP OAuth and all four provider integrations remain available.

SQLite migration 0012 preserves existing data and adds atomic job claims, client-scoped access, cancellation protection, retry scheduling and at-most-once automatic commit reservation. Uncertain writes require manual reconciliation; they are never automatically replayed. [Upgrade and recovery instructions](docs/operations.md) describe compatibility changes and backups. This candidate has not been published or deployed.
