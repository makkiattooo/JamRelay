---
title: MCP OAuth
---

# MCP OAuth

TuneLink includes an OAuth authorization server for remote MCP clients. Spotify OAuth is separate and continues to use the `SPOTIFY_*` variables.

## Supported features

- Authorization Code flow;
- PKCE `S256` enforced;
- exact per-client redirect validation;
- RFC 9207 `iss` in authorization responses;
- RFC 9728 protected-resource metadata at root and path-suffixed discovery URLs;
- authorization-server metadata;
- MCP `resource` validation;
- one-hour access tokens;
- rotating refresh tokens;
- public clients with `token_endpoint_auth_method=none`;
- confidential clients with `client_secret_basic` or `client_secret_post`;
- multiple static clients;
- RFC 7591 Dynamic Client Registration for deployed-client compatibility;
- owner approval protected by `MCP_OAUTH_OWNER_SECRET`.

## Recommended configuration for automatic clients

For clients that support DCR:

```dotenv
PUBLIC_BASE_URL=https://mcp.example.com
MCP_OAUTH_OWNER_SECRET=<STRONG_RANDOM_SECRET>
MCP_OAUTH_DCR_ENABLED=true
```

No client ID or callback needs to be created manually. The client registers itself first.

Discovery chain:

```text
/.well-known/oauth-protected-resource
/.well-known/oauth-protected-resource/mcp
/.well-known/oauth-authorization-server
/oauth/register
/oauth/authorize
/oauth/token
```

## Existing ChatGPT setup stays valid

The original single pre-registered client variables remain supported:

```dotenv
MCP_OAUTH_CLIENT_ID=chatgpt-tunelink
MCP_OAUTH_CLIENT_SECRET=<STRONG_RANDOM_SECRET>
MCP_OAUTH_REDIRECT_URI=<EXACT_CALLBACK_FROM_CHATGPT>
MCP_OAUTH_OWNER_SECRET=<OWNER_APPROVAL_SECRET>
```

That client can coexist with DCR and the multi-client registry.

## Multiple static clients

Set `MCP_OAUTH_CLIENTS_PATH` to a JSON registry. Locally its default is:

```text
./data/mcp-oauth-clients.json
```

and in production Docker:

```text
/data/mcp-oauth-clients.json
```

Start from:

```text
examples/mcp-oauth-clients.example.json
```

Each static client can have several redirect URIs. Clients without a secret can use `tokenEndpointAuthMethods: ["none"]`.

## DCR security model

`POST /oauth/register` is unauthenticated by design because an unknown MCP client must obtain a client ID before authorization can begin. Registration does **not** authorize Spotify access.

TuneLink limits the exposed registration surface by:

- OAuth endpoint rate limiting;
- a bounded dynamic-client registry;
- short retention for registrations that were never approved;
- eventual pruning of inactive approved registrations;
- mandatory owner approval before code issuance;
- PKCE `S256`;
- redirect scheme/host validation;
- hashed storage of dynamically generated client secrets.

Disable DCR if you only want pre-registered clients:

```dotenv
MCP_OAUTH_DCR_ENABLED=false
```

## Native clients and callbacks

Native/CLI clients may register a random loopback callback such as:

```text
http://localhost:49152/oauth/callback
```

TuneLink accepts loopback HTTP callbacks. For clients that explicitly register as `application_type=native`, it also accepts private-use callback schemes while rejecting dangerous content/file schemes.

## Persistent OAuth store

OAuth state defaults to:

```text
./data/mcp-oauth.json
```

locally and:

```text
/data/mcp-oauth.json
```

in the production Docker image.

The store contains hashed authorization codes/tokens, refresh-token state, and DCR metadata. Keep it persistent and private.

## CIMD status

The MCP 2026-07-28 specification prefers **Client ID Metadata Documents (CIMD)** and deprecates DCR long-term. TuneLink intentionally does not advertise CIMD in this release.

Supporting CIMD on the authorization-server side means fetching client-controlled HTTPS metadata. That should be added only with deliberate SSRF and DNS-rebinding protections. Current compatibility is provided through pre-registration plus DCR.

See [OAuth and multi-client compatibility](/clients/oauth-compatibility) for client-specific behavior.
