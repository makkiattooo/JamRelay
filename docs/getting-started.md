# Getting started

## Requirements

- Node.js 22 or newer, or Docker.
- A Spotify Developer application with a callback URL you control.
- A Spotify account. Playback control may require Spotify Premium and an active compatible device.

## Quick start

```bash
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npm run dev
```

Fill `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, and `PUBLIC_BASE_URL` in `.env`. For a protected remote deployment, use `MCP_AUTH_MODE=bearer` with a strong `MCP_API_KEY`, or configure MCP OAuth as described in [MCP authentication](/oauth).

Open `http://127.0.0.1:5267/auth/providers/spotify/start`, approve access, then check `/auth/status` and `/health`. Configure the client with `http://127.0.0.1:5267/mcp` for local use.

For owner administration, set `MCP_OAUTH_OWNER_SECRET`, open
`/owner/login`, and use the Connection Hub at `/connections/ui`. Provider OAuth
connects credentials; MCP OAuth consent separately grants a client only the
selected connections and operation groups. See [Provider connections](/provider-connections).

## Features implemented

Search and entity reads, current-user playlists, playlist contents and writes, saved tracks, top and recent items, current playback, devices, play/pause/next/previous, seek, volume, transfer playback, deterministic track lookup, bulk playlist operations, deduplication, and playlist statistics.

The `get_artist_top_tracks` tool remains registered and reports `spotify_feature_removed`, because the corresponding Spotify endpoint was removed. See the [tool reference](/tools).
