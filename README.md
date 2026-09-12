# TuneLink

Self-hosted MCP server for connecting AI assistants to your own Spotify account.

> **Unofficial project:** TuneLink is not affiliated with, endorsed by, or sponsored by Spotify, OpenAI, Anthropic, Google, or any other AI platform vendor.

TuneLink exposes Spotify search, playlist, library, discovery and playback tools over MCP Streamable HTTP. It supports Spotify OAuth, multi-client MCP OAuth with PKCE, Dynamic Client Registration (DCR), optional static Bearer authentication, encrypted token persistence and Docker deployment.

## Documentation

The VitePress documentation is the primary user documentation:

- [English](docs/index.md) — canonical / source of truth
- [Polski](docs/pl/index.md) — high-priority translation
- [Deutsch](docs/de/index.md) — best effort
- [Français](docs/fr/index.md) — best effort
- [Español](docs/es/index.md) — best effort

Translations may lag behind the English documentation. The website displays that warning automatically on non-English pages. See the [translation policy](docs/translation-policy.md).

## Quick start

```bash
npm ci
cp .env.example .env
npm run dev
```

PowerShell:

```powershell
Copy-Item .env.example .env
npm run dev
```

Configure your own Spotify Developer application and secrets in `.env`, then open `/auth/spotify/login`.

## MCP OAuth compatibility

One deployment can keep an existing pre-registered ChatGPT client while also accepting DCR clients such as Claude Code, Gemini CLI, VS Code, and other standards-compatible MCP hosts. ChatGPT has been exercised end-to-end on the project deployment; other vendor paths are documented as protocol-compatible until separately verified. See [OAuth and multi-client compatibility](docs/clients/oauth-compatibility.md).

## Common deployment paths

- local Node.js
- Docker / Docker Compose
- home server or NAS
- local machine + Cloudflare Tunnel
- free-tier VM with persistent storage
- small paid VPS

See [free hosting](docs/deployment/free-hosting.md) and [free/low-cost deployment](docs/deployment/budget-hosting.md).

## Documentation maintenance

Fast-changing technical references are generated instead of copied across five locales:

```bash
npm run docs:generate
```

This regenerates:

- MCP tool reference from the actual registered MCP tools
- environment variable reference from `.env.example`
- translated reference stubs that point to the canonical generated reference

Navigation is defined once in `docs/.vitepress/navigation.mts`. Add a page there once; localized labels are optional and fall back to English.

Run the full documentation validation with:

```bash
npm run docs:check
```

## Development

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npm run docs:build
```

Or run the combined verification:

```bash
npm run check
```

## Security

See [SECURITY.md](SECURITY.md). Keep `.env`, OAuth token stores and `/data` out of version control and public web roots.

## License

MIT. See [LICENSE](LICENSE).
