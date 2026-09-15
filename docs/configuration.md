---
title: Configuration
description: Configure provider connections, the HTTP server, token storage and MCP authentication.
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
./data/mcp-oauth.json
./data/mcp-oauth-clients.json
```

Production Docker (`NODE_ENV=production`):

```text
/data/mcp-oauth.json
/data/mcp-oauth-clients.json
```

All paths can be overridden.

Provider credentials are stored by connection ID in the encrypted provider credential store. It is separate from the MCP OAuth store.

## SoundCloud provider

SoundCloud is disabled unless all three variables are set. The provider uses
OAuth 2.1 Authorization Code + PKCE and stores its rotating tokens in the
encrypted provider credential store; the client secret and tokens must never
be committed.

```dotenv
SOUNDCLOUD_CLIENT_ID=
SOUNDCLOUD_CLIENT_SECRET=
SOUNDCLOUD_REDIRECT_URI=http://127.0.0.1:5267/auth/providers/soundcloud/callback
PROVIDER_CREDENTIAL_STORE_PATH=./data/provider-credentials.json
TOKEN_ENCRYPTION_KEY=<32-byte-base64-key>
```

SoundCloud currently exposes identity, track catalog, playlist reads and
playlist writes through the generic provider surface. Spotify Connect,
library, playback and listening-history capabilities are not claimed for
SoundCloud.

## Apple Music provider

Apple Music does not use Spotify-style OAuth. The server signs a short-lived
Developer Token with a Media Services `.p8` private key. Catalog requests use
that token. Library playlists require a Music User Token obtained by MusicKit
on an Apple platform or in a browser/client context; a server-only process
cannot securely mint it. An operator may submit that token through the
owner-protected `POST /auth/apple-music/user-token` route using the
`x-jamrelay-owner-secret` header. The token is encrypted at rest and never
returned by MCP. Apple Music currently exposes catalog search/get and library
playlist list/get/create/add; remove, reorder and replace are explicitly
unsupported.

## YouTube provider

YouTube uses Google's OAuth 2.0 web-server flow with the `youtube.force-ssl`
scope. It integrates the official YouTube Data API v3, whose playlist items
are videos. It does not use or imply an official YouTube Music library API.
Search and playlist operations report estimated Data API quota units:
`search.list` currently costs 1 unit, with a separate default daily limit of
100 calls, and `playlistItems.insert` costs 50 units per call. Tokens are encrypted by connection ID and refresh tokens are handled
through Google's OAuth flow.

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

### Static MCP clients

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
PROVIDER_CREDENTIAL_STORE_PATH=./data/provider-credentials.json
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
`PLAYLIST_READ_CONCURRENCY` controls the bounded worker count used for safe
offset-based playlist pagination. Cursor-based providers remain sequential.
