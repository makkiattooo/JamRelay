<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logos/jamrelay-logo-dark.png.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/logos/jamrelay-logo-light.png.png">
  <img src="assets/logos/jamrelay-logo-dark.png.png" alt="JamRelay" width="360">
</picture>

**Self-hosted music automation for AI agents through MCP.**

[![Release](https://img.shields.io/github/v/release/makkiattooo/JamRelay?style=flat-square)](https://github.com/makkiattooo/JamRelay/releases)
[![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue?style=flat-square)](LICENSE)
[![CI](https://github.com/makkiattooo/JamRelay/actions/workflows/ci.yml/badge.svg)](https://github.com/makkiattooo/JamRelay/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.13.0-339933?style=flat-square&logo=node.js&logoColor=white)](package.json)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-6f42c1?style=flat-square)](docs/mcp-client.md)
[![Providers](https://img.shields.io/badge/providers-Spotify%20%7C%20SoundCloud%20%7C%20Apple%20Music%20%7C%20YouTube-6f42c1?style=flat-square)](docs/providers/)
[![M8ven Score](https://m8ven.ai/badge/mcp/makkiattooo-jamrelay-1qzbwr)](https://m8ven.ai/mcp/makkiattooo-jamrelay-1qzbwr?s=readme)

[Documentation](https://makkiattooo.github.io/JamRelay/) · [Quick start](docs/installation.md) · [Polski](docs/pl/index.md)

</div>

## What is JamRelay?

JamRelay connects compatible AI assistants to your music services. Search for
music, organize playlists and run repeatable music workflows through one MCP
server that you host and control.

It supports Spotify, SoundCloud, Apple Music and YouTube. Each provider keeps
its own connection and capabilities; an installation can start without any
connected accounts.

## Key features

- **Music workflows:** search, playlist organization, transfers and automation.
- **Preview before writing:** dry runs, snapshots and recovery information for
  supported playlist operations.
- **Durable jobs:** long-running work with progress, cancellation and recovery.
- **Owner-controlled access:** explicit provider authorization and MCP grants.
- **Local operation:** persistent state, encrypted provider credentials and an
  operator CLI, with no web administration dashboard.

See the [guides](docs/playlist-automation.md) and
[provider capabilities](docs/providers/capabilities.md) for supported operations
and their limits.

## Quick start

Requires **Node.js 22.13 or later**. Once the official npm package is published:

```bash
npm install -g jamrelay
jamrelay setup
jamrelay start
jamrelay onboard
```

The setup command configures storage and a masked owner password, then exits. Run
`jamrelay onboard` to configure network access, music connections and MCP clients
or open the management menu.
You obtain provider developer credentials yourself and authorize accounts
separately through the owner consent flow. Existing installations can stop the
server and run `jamrelay owner password` without changing encryption keys.

**Public distribution is pending.** For a development checkout or candidate
archive, follow [installation](docs/installation.md). The same page covers the
recommended Docker Compose workflow and persistent storage.

## Supported providers

| Provider    | Integration                                                 |
| ----------- | ----------------------------------------------------------- |
| Spotify     | Catalog, playlists, library and supported playback controls |
| SoundCloud  | Catalog and playlists                                       |
| Apple Music | Catalog and supported MusicKit library playlist operations  |
| YouTube     | Videos and playlists through YouTube Data API v3            |

Features differ by provider. See [provider setup](docs/providers/index.md) for
credentials, authorization and capability restrictions. Spotify playback
requires an eligible account and active device.

## Connect your AI agent

Add the MCP endpoint shown by setup to a compatible client, complete owner
OAuth consent, then request its tool list to verify the connection. `jamrelay connect client
claude-code` can register a local Claude Code installation after confirmation;
inside Docker it prints the exact host-side command. Use `--verify` afterward
to check actual OAuth authentication and tool discovery. The local
default is `http://localhost:5267/mcp`; remote access requires reachable HTTPS.

[ChatGPT](docs/clients/chatgpt.md) · [Claude](docs/clients/claude.md) ·
[Cursor](docs/clients/cursor.md) · [Other MCP clients](docs/clients/index.md)

## Documentation

- [Install and deploy](docs/installation.md)
- [Connect music providers](docs/provider-connections.md)
- [Connect an AI client](docs/clients/index.md)
- [CLI updates, notices and offline information](docs/cli-information.md)
- [Operations and backups](docs/operations.md)
- [Generated MCP tool reference](docs/tools-reference.md)
- [Security](docs/security.md)

Provider integrations require individual credentials and authorization; live
verification is separate from automated tests. See the [release review notes](docs/deployment/release-candidate.md).

English is canonical. Entry points are available in [Polski](docs/pl/index.md),
[Deutsch](docs/de/index.md), [Français](docs/fr/index.md) and
[Español](docs/es/index.md); incomplete translations link to English references.

For release history, see [CHANGELOG](CHANGELOG.md) and
[GitHub Releases](https://github.com/makkiattooo/JamRelay/releases).

## Contributing & license

Read [CONTRIBUTING](CONTRIBUTING.md) before submitting changes and
[SECURITY](SECURITY.md) to report a vulnerability.

JamRelay is licensed under [AGPL-3.0-only](LICENSE); see
[licensing](LICENSING.md) for additional information.

This is an unofficial community project, unaffiliated with music providers or
AI platform vendors. Provider terms and API limitations still apply.

### Manage MCP permissions

Permissions belong to authenticated OAuth registrations, independently of the model or application name. New approvals default to read-only and require explicit account selection. Existing grants, credentials and database migrations are preserved.

```bash
jamrelay clients list
jamrelay clients show CLIENT_ID
jamrelay clients permissions CLIENT_ID
jamrelay clients permissions set CLIENT_ID
jamrelay clients permissions set CLIENT_ID --permissions catalog.read,playlist.read --connections spotify-default --tools all
jamrelay clients revoke CLIENT_ID
jamrelay clients policy
jamrelay clients policy set --permissions catalog.read,playlist.read,diagnostics.read --tools all
```

`permissions set` opens an interactive selector without flags; `--tools` can restrict a grant to comma-separated tool names. Empty scope/account/tool lists deny access. Policy changes alter initial consent defaults only; existing grants remain unchanged. Grant changes apply to existing tokens and queued work immediately. Refresh the client's tool list after editing; revoked OAuth clients must authorize again. An external provider request already accepted cannot be recalled. Legacy API-key access remains an owner-controlled shared registration named `api-key`; use OAuth for separate client identities.

New installations default to `JAMRELAY_TOOLSET=essential` (14 common tools before permission/capability filtering). `advanced` adds music automation, transfer and personalization; `all` also exposes authorized internal diagnostics. Existing configured profiles are retained. Version 1.5.7 retires 20 nonfunctional/obsolete tool registrations; the full catalog has 95 tools with database features enabled. Provider support and grants can reduce discovery further.

`jamrelay connect client cursor` and `jamrelay connect client vscode` offer project/user configuration with JSONC preservation and backups. Different existing JamRelay entries are preserved for manual review. Claude Code registration uses its installed CLI; Claude Desktop can use the optional local stdio bridge described in [the client guide](docs/clients/claude.md). Containers print instructions for the host (PowerShell on Windows). OAuth login, observed tool discovery and provider authorization remain separate verification steps. Spotify and native Windows Docker/Desktop flows require the owner's live test.
