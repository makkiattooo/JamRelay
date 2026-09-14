---
title: Environment reference
description: Generated reference for variables documented in .env.example.
---

# Environment reference

> **Generated file.** `.env.example` is the documentation source for this page. Run `npm run docs:generate` after changing it.

## Spotify OAuth

### `SPOTIFY_CLIENT_ID`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_

### `SPOTIFY_CLIENT_SECRET`

- **Sensitive:** yes
- **Example/default in `.env.example`:** _empty_

### `SPOTIFY_REDIRECT_URI`

- **Sensitive:** no
- **Example/default in `.env.example`:** `http://127.0.0.1:5267/auth/providers/spotify/callback`
- **Notes:** Local development:

### `SPOTIFY_MARKET`

- **Sensitive:** no
- **Example/default in `.env.example`:** `PL`

### `SPOTIFY_READ_CONCURRENCY`

- **Sensitive:** no
- **Example/default in `.env.example`:** `12`

### `SOUNDCLOUD_CLIENT_ID`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_

### `SOUNDCLOUD_CLIENT_SECRET`

- **Sensitive:** yes
- **Example/default in `.env.example`:** _empty_

### `SOUNDCLOUD_REDIRECT_URI`

- **Sensitive:** no
- **Example/default in `.env.example`:** `http://127.0.0.1:5267/auth/providers/soundcloud/callback`

### `APPLE_MUSIC_TEAM_ID`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_
- **Notes:** Optional Apple Music API credentials. This is not Spotify-style OAuth: the server signs developer tokens with the private .p8 key, while a user authorizes MusicKit in a client/browser and submits the Music User Token through the protected owner route documented in docs/configuration.md.

### `APPLE_MUSIC_KEY_ID`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_

### `APPLE_MUSIC_PRIVATE_KEY_PATH`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_

### `APPLE_MUSIC_STOREFRONT`

- **Sensitive:** no
- **Example/default in `.env.example`:** `us`

### `YOUTUBE_CLIENT_ID`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_
- **Notes:** Optional official YouTube Data API v3 OAuth. This models YouTube playlists of videos, not an unofficial YouTube Music API. playlistItems writes consume quota units; credentials are stored encrypted by connection ID.

### `YOUTUBE_CLIENT_SECRET`

- **Sensitive:** yes
- **Example/default in `.env.example`:** _empty_

### `YOUTUBE_REDIRECT_URI`

- **Sensitive:** no
- **Example/default in `.env.example`:** `http://127.0.0.1:5267/auth/providers/youtube/callback`

### `ALTERNATE_TRACK_RESOLVER_URL`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_
- **Notes:** Optional alternate resolver API. Disabled when URL is unset. The API must return JSON: { "candidates": [{ "spotifyUrl": "https://open.spotify.com/track/..." }] }.

### `ALTERNATE_TRACK_RESOLVER_NAME`

- **Sensitive:** no
- **Example/default in `.env.example`:** `web_search`

### `ALTERNATE_TRACK_RESOLVER_TOKEN`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_

### `ALTERNATE_TRACK_RESOLVER_TIMEOUT_MS`

- **Sensitive:** no
- **Example/default in `.env.example`:** `2500`

### `ALTERNATE_TRACK_RESOLVER_MAX_RESULTS`

- **Sensitive:** no
- **Example/default in `.env.example`:** `5`

## Server

### `HOST`

- **Sensitive:** no
- **Example/default in `.env.example`:** `0.0.0.0`

### `PORT`

- **Sensitive:** no
- **Example/default in `.env.example`:** `5267`

### `PUBLIC_BASE_URL`

- **Sensitive:** no
- **Example/default in `.env.example`:** `http://127.0.0.1:5267`

### `TRUST_PROXY`

- **Sensitive:** no
- **Example/default in `.env.example`:** `false`

### `LOG_LEVEL`

- **Sensitive:** no
- **Example/default in `.env.example`:** `info`

### `JAMRELAY_TOOLSET`

- **Sensitive:** no
- **Example/default in `.env.example`:** `all`

### `JAMRELAY_DATA_DIR`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_
- **Notes:** Persistent JamRelay State DB. These are infrastructure settings, not secrets. Local default: ./data/jamrelay.db Docker production: /data/jamrelay.db (Compose sets JAMRELAY_DATA_DIR=/data).

### `JAMRELAY_DB_PATH`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_
- **Notes:** Optional explicit path; overrides JAMRELAY_DATA_DIR when set.

## Token encryption

### `TOKEN_ENCRYPTION_KEY`

- **Sensitive:** yes
- **Example/default in `.env.example`:** _empty_

### `PROVIDER_CREDENTIAL_STORE_PATH`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_
- **Notes:** Encrypted multi-provider credential store, keyed by connection ID. All provider credentials use this store. Local default: ./data/provider-credentials.json Docker default (NODE_ENV=production): /data/provider-credentials.json

## MCP authentication

### `MCP_AUTH_MODE`

- **Sensitive:** no
- **Example/default in `.env.example`:** `none`

### `MCP_API_KEY`

- **Sensitive:** yes
- **Example/default in `.env.example`:** _empty_

## MCP OAuth

### `MCP_OAUTH_OWNER_SECRET`

- **Sensitive:** yes
- **Example/default in `.env.example`:** _empty_
- **Notes:** Owner approval password. Required to actually authorize any OAuth client. It is never sent to the AI client.

### `MCP_OAUTH_STORE_PATH`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_
- **Notes:** OAuth state/token/DCR registry store. Local default: ./data/mcp-oauth.json Docker default (NODE_ENV=production): /data/mcp-oauth.json

### `MCP_OAUTH_CLIENTS_PATH`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_
- **Notes:** Optional static multi-client registry. Local default: ./data/mcp-oauth-clients.json Docker default (NODE_ENV=production): /data/mcp-oauth-clients.json Missing file = empty static registry.

### `MCP_OAUTH_DCR_ENABLED`

- **Sensitive:** no
- **Example/default in `.env.example`:** `true`
- **Notes:** Dynamic Client Registration (RFC 7591). true is recommended for Claude, Gemini CLI, VS Code and other clients that automatically register localhost callbacks. Set false to allow only pre-registered clients.
