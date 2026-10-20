# JamRelay v1.5.5

Release candidate for owner review. Tag `v1.5.5`, public registries and the GitHub Release are not created by preparing this document.

## Changes since v1.2.0

- Self-hosted, provider-neutral MCP integration for Spotify, SoundCloud, Apple Music and YouTube, with capability-aware routing and encrypted credentials.
- Durable playlist jobs with progress, provider/client isolation, bounded retries, cancellation, previews and supported snapshot/recovery workflows.
- Owner password login (salted memory-hard scrypt), retained recovery/legacy secret, rate-limited browser authentication and explicit provider replacement consent. Existing CSRF, OAuth state, PKCE and refresh-token rotation remain enforced.
- Generic AI-client authorization branding, read-only defaults and explicit optional library, playlist, playback, transfer and destructive grants.
- Unified CLI and multilingual setup; Docker probes use the internal service while clients receive the published host URL. DNS/TLS are N/A for local HTTP.
- Claude Code registration and safe local Cursor/VS Code JSON setup; honest manual flows for Docker-hosted setup, ChatGPT and Claude Desktop remote Connectors. Verification requires actual authenticated MCP tool discovery.
- Installable npm archive, persistent `/data`, multi-architecture GHCR release workflow and isolated Docker smoke CI. The old Admin Dashboard remains removed.

## Installation

After official public publication is verified:

```bash
npm install -g jamrelay@1.5.5
jamrelay setup
jamrelay connect provider spotify
jamrelay start
```

In a second terminal, run `jamrelay onboard`. See [installation](/installation) for source-candidate archives and Docker Compose. Never substitute an unrelated npm package when the official release is unavailable.

```bash
docker pull ghcr.io/makkiattooo/jamrelay:1.5.5
docker run --rm -it -v jamrelay_data:/data ghcr.io/makkiattooo/jamrelay:1.5.5 setup
docker run -d --name jamrelay -p 127.0.0.1:5267:5267 -v jamrelay_data:/data ghcr.io/makkiattooo/jamrelay:1.5.5 start
```

These registry commands require publication; building a source checkout does not publish them.

## Upgrade and migration

Stop JamRelay and back up the private configuration plus data/credentials before replacing code. Preserve `TOKEN_ENCRYPTION_KEY`, the recovery secret, provider credentials and OAuth stores. Version 1.5.5 adds forward migration `0013_client_discovery.sql`, containing only client ID, tool count and discovery timestamp. Start applies pending migrations. Do not downgrade against a newer schema without restoring the matching backup.

Existing owner secrets continue to work. To migrate, stop the server and run `jamrelay owner password` (Compose: `docker compose run --rm jamrelay owner password`), then restart. Password confirmation is masked; only a salted scrypt hash is stored. Recovery and encryption material are retained. Noninteractive `setup --yes` retains recovery access and does not ask for a password.

New OAuth approvals default to read access. Existing active grants are preserved until explicitly changed. After authorizing a music account, reconnect any MCP client whose grant does not yet include it.

## Verification limits

Automated checks cover the MCP/OAuth path, password login, local fixtures, packaging and Docker networking. Real Spotify OAuth/API and Claude Code desktop/browser interaction must be checked by the owner with their own account before release. SoundCloud, Apple Music and YouTube are implemented but not live-verified in this sprint. Provider access policies, subscriptions, quotas and client plan restrictions still apply.

Automatic configuration deliberately refuses JSONC and symlinked files; use the displayed manual fragment. A container cannot install host clients. Claude Desktop instructions cover its remote Connector, not a bundled local extension. Public ChatGPT/Claude Desktop connectors cannot use private localhost. CLI status is evidence from the selected OAuth registration, not a claim that every client or music provider works.
