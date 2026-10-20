# Install your own JamRelay

Require Node.js >=22.13 (22 LTS is used by Docker/CI), or Docker Desktop/Engine with Compose. The user operates the server and brings their own provider credentials; the free skill includes no hosted endpoint.

## Verified development candidate path

Before public distribution is approved, install from the official repository:

```bash
git clone --branch codex/jamrelay-work https://github.com/makkiattooo/JamRelay.git
cd JamRelay
npm ci
npm run build
node dist/cli.js setup
node dist/cli.js connect provider spotify
node dist/cli.js start
```

In another terminal from the same checkout:

```bash
node dist/cli.js onboard
```

Alternatively, run `npm pack` and install the archive printed by npm with `npm install -g <archive>`. Then use `jamrelay` normally.

## After public publication is confirmed

Check both exact version and official repository metadata:

```bash
npm view jamrelay@1.5.9 version repository.url
npm install -g jamrelay@1.5.9
jamrelay setup
jamrelay connect provider spotify
jamrelay start
```

In another terminal run `jamrelay onboard`. Create an owner password during interactive setup. For an existing installation, stop the server and run `jamrelay owner password`; preserve private configuration, the recovery secret, encryption key and data. `setup --yes` is noninteractive and preserves legacy/recovery access; set a password interactively afterward.

## Docker Compose

From the official source checkout:

```bash
docker compose run --rm jamrelay setup
docker compose run --rm jamrelay connect provider spotify
docker compose up -d --wait
docker compose run --rm jamrelay onboard
```

Set `JAMRELAY_PORT` in your host environment to change the published port. Use the exact host-facing MCP URL printed by the wizard. Compose probes the internal service separately; client configuration must use the host address. Persistent `/data` contains private configuration and encrypted credentials. Do not delete its volume during an upgrade.

After an approved GHCR release exists, use `ghcr.io/makkiattooo/jamrelay:1.5.9` with a persistent `/data` volume. Do not assume an image exists before checking official publication.

## Connect a client

For local Claude Code, run on the host (PowerShell on Windows), substituting the printed MCP URL:

```text
claude mcp add --transport http jamrelay <YOUR_MCP_URL>
claude mcp get jamrelay
```

Open Claude Code and run `/mcp`; authenticate in the browser with the JamRelay owner password, select the music account and least required permissions. Request the tool list. `jamrelay connect client claude-code --verify` checks server-observed authentication and actual tool discovery; registration alone is not verification.

For Cursor merge the `mcpServers.jamrelay.url` entry in `~/.cursor/mcp.json`. For VS Code merge `servers.jamrelay` with `type: http` and `url` in your project's `.vscode/mcp.json`. `jamrelay connect client cursor|vscode` can apply local JSON after confirmation and backup; JSONC requires manual editing. A Docker container prints host-side instructions and cannot edit the host's client files.

For Codex CLI or Desktop on the Windows host, run `codex mcp add jamrelay --url <YOUR_MCP_URL>` and verify registration with `codex mcp list`. Both applications share the user MCP configuration; complete OAuth and request the tool list before treating the connection as verified.

For ChatGPT and Claude Desktop remote Connectors, configure a public HTTPS endpoint using `jamrelay connectivity`. Local HTTP, Tailscale Funnel, ngrok, Cloudflare Quick Tunnel, custom Cloudflare Tunnel and an existing reverse proxy remain options as appropriate. Quick tunnels are temporary and must pass the actual endpoint checks. No purchased domain is required. ChatGPT uses a pre-registered confidential client per the official JamRelay guide; there is no one-click installation link. Claude Desktop remote Connectors are not local MCP extensions.

## Authorize music separately

Application credentials do not authorize a listener account. Sign in at `<YOUR_ORIGIN>/owner/login`, then open `<YOUR_ORIGIN>/auth/providers/spotify/start`, approve and complete Spotify OAuth. Register the exact callback printed by the wizard in Spotify's developer app. Authorize before granting the account to a new MCP client, or reconnect an existing client afterward. Start with reads, then explicitly grant playlist modifications/destructive operations only for a requested test playlist.

SoundCloud and YouTube have equivalent provider start routes. Apple Music uses MusicKit, a private `.p8` key and a separate Music User Token through the owner-protected endpoint documented in the repository. Inside Docker the private key path must be accessible through a deliberate read-only mount. No provider has been live-verified merely because its credentials were saved.
