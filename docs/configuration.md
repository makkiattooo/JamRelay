---
title: Configuration
description: Configure Spotify, the HTTP server, token storage and MCP authentication.
---

# Configuration

Copy `.env.example` to `.env`. Never commit `.env` or runtime token stores.

The complete variable table is **generated from `.env.example`**:

[Open the generated environment reference →](/environment-reference)

## Sources of truth

```text
src/config.ts       runtime validation/defaults
.env.example        public configuration contract + human notes
        ↓
npm run docs:generate
        ↓
docs/environment-reference.md
```

When adding a variable, update the runtime schema and `.env.example`; do not hand-edit five translated tables.

## Storage defaults

Local development:

```text
./data/spotify-token.json
./data/mcp-oauth.json
./data/mcp-oauth-clients.json
```

Production Docker (`NODE_ENV=production`):

```text
/data/spotify-token.json
/data/mcp-oauth.json
/data/mcp-oauth-clients.json
```

All paths can be overridden.

## MCP authentication

JamRelay can accept OAuth and an optional static Bearer key at the same time.

`MCP_AUTH_MODE=bearer` enables `MCP_API_KEY` as an additional authentication path.

`MCP_AUTH_MODE=none` disables only the static API key. It does **not** make an OAuth-protected `/mcp` endpoint public.

### OAuth owner secret

OAuth authorization is enabled when an owner secret is configured:

```dotenv
MCP_OAUTH_OWNER_SECRET=<STRONG_RANDOM_SECRET>
```

That secret is entered only on JamRelay's owner approval page. It is never sent to the MCP client.

### Dynamic clients

For Claude, Gemini CLI, VS Code, and other clients that can register automatically:

```dotenv
MCP_OAUTH_OWNER_SECRET=<STRONG_RANDOM_SECRET>
MCP_OAUTH_DCR_ENABLED=true
```

### Legacy/static ChatGPT client

The backwards-compatible single-client variables are optional, but if any of these three are provided, all three are required:

```dotenv
MCP_OAUTH_CLIENT_ID=
MCP_OAUTH_CLIENT_SECRET=
MCP_OAUTH_REDIRECT_URI=
```

They also require `MCP_OAUTH_OWNER_SECRET`.

### Several pre-registered clients

Use:

```dotenv
MCP_OAUTH_CLIENTS_PATH=./data/mcp-oauth-clients.json
```

and start from `examples/mcp-oauth-clients.example.json`.

The registry can contain ChatGPT, Cursor, VS Code, Claude, or any other known client simultaneously. DCR may remain enabled for automatic clients at the same time.

## Local Bearer-only development

```dotenv
PUBLIC_BASE_URL=http://127.0.0.1:5267
HOST=127.0.0.1
PORT=5267
MCP_AUTH_MODE=bearer
MCP_API_KEY=GENERATE_A_SEPARATE_RANDOM_VALUE
SPOTIFY_TOKEN_STORE_PATH=./data/spotify-token.json
MCP_OAUTH_STORE_PATH=./data/mcp-oauth.json
TRUST_PROXY=false
```

Leave `MCP_OAUTH_OWNER_SECRET` empty if you do not want OAuth at all.

## Remote deployment: ChatGPT + automatic OAuth clients

```dotenv
PUBLIC_BASE_URL=https://mcp.example.com
HOST=0.0.0.0
PORT=5267

MCP_AUTH_MODE=bearer
MCP_API_KEY=GENERATE_A_SEPARATE_RANDOM_VALUE

MCP_OAUTH_OWNER_SECRET=GENERATE_A_SEPARATE_RANDOM_VALUE
MCP_OAUTH_DCR_ENABLED=true

# Existing ChatGPT pre-registration:
MCP_OAUTH_CLIENT_ID=chatgpt-jamrelay
MCP_OAUTH_CLIENT_SECRET=GENERATE_A_SEPARATE_RANDOM_VALUE
MCP_OAUTH_REDIRECT_URI=https://EXACT_CALLBACK_FROM_CHATGPT

SPOTIFY_TOKEN_STORE_PATH=/data/spotify-token.json
MCP_OAUTH_STORE_PATH=/data/mcp-oauth.json
MCP_OAUTH_CLIENTS_PATH=/data/mcp-oauth-clients.json
TRUST_PROXY=true
```

This configuration lets the existing ChatGPT static client coexist with DCR clients without changing ChatGPT's callback.

## Generating secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use separate random values for the encryption key, API key, OAuth client secret, and owner secret. `TOKEN_ENCRYPTION_KEY` must decode from base64 to exactly 32 bytes.
