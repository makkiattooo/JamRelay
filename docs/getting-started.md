# Getting started

## Requirements

- Node.js 22 or newer, or Docker.
- A provider application only if you want provider-backed operations immediately.
- A Spotify Premium account and active device only for Spotify playback controls.

## Quick start

```bash
npm ci
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npm run dev
```

Fill `PUBLIC_BASE_URL`, `MCP_OAUTH_OWNER_SECRET` and `TOKEN_ENCRYPTION_KEY` in `.env`. Provider blocks
are optional, but each configured block must be complete. For a protected
remote deployment, use `MCP_AUTH_MODE=bearer` with a strong `MCP_API_KEY`, or
configure MCP OAuth as described in [MCP authentication](/oauth).

Sign in at `http://127.0.0.1:5267/owner/login` with the configured owner secret. Then open `/auth/providers/spotify/start` and explicitly approve connection or replacement. Check `/health` for readiness and `npm run operator -- status` for local status. The MCP endpoint is `/mcp`; its OAuth consent remains separate. Use the [operator CLI](/operations) for local operations.

## Features implemented

Search and entity reads, current-user playlists, playlist contents and writes, saved tracks, top and recent items, current playback, devices, play/pause/next/previous, seek, volume, transfer playback, deterministic track lookup, bulk playlist operations, deduplication, and playlist statistics.

The `get_artist_top_tracks` tool remains registered and reports `spotify_feature_removed`, because the corresponding Spotify endpoint was removed. See the [tool reference](/tools).
