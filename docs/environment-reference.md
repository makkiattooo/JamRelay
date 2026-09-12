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
- **Example/default in `.env.example`:** `http://127.0.0.1:3000/auth/spotify/callback`
- **Notes:** Local development:

### `SPOTIFY_MARKET`

- **Sensitive:** no
- **Example/default in `.env.example`:** `PL`

## Server

### `HOST`

- **Sensitive:** no
- **Example/default in `.env.example`:** `0.0.0.0`

### `PORT`

- **Sensitive:** no
- **Example/default in `.env.example`:** `3000`

### `PUBLIC_BASE_URL`

- **Sensitive:** no
- **Example/default in `.env.example`:** `http://127.0.0.1:3000`

### `TRUST_PROXY`

- **Sensitive:** no
- **Example/default in `.env.example`:** `false`

### `LOG_LEVEL`

- **Sensitive:** no
- **Example/default in `.env.example`:** `info`

## Token encryption

### `TOKEN_ENCRYPTION_KEY`

- **Sensitive:** yes
- **Example/default in `.env.example`:** _empty_

### `SPOTIFY_TOKEN_STORE_PATH`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_
- **Notes:** Encrypted Spotify token store. Local default: ./data/spotify-token.json Docker default (NODE_ENV=production): /data/spotify-token.json

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
- **Notes:** Dynamic Client Registration (RFC 7591 compatibility). true is recommended for Claude, Gemini CLI, VS Code and other clients that automatically register localhost callbacks. Set false to allow only pre-registered clients.

### `MCP_OAUTH_CLIENT_ID`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_
- **Notes:** Legacy single pre-registered client. Kept for backwards compatibility and useful for ChatGPT or another provider that gives you an exact callback URL. Leave all three blank if you use only DCR and/or MCP_OAUTH_CLIENTS_PATH.

### `MCP_OAUTH_CLIENT_SECRET`

- **Sensitive:** yes
- **Example/default in `.env.example`:** _empty_

### `MCP_OAUTH_REDIRECT_URI`

- **Sensitive:** no
- **Example/default in `.env.example`:** _empty_
