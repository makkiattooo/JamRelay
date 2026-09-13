# Generic MCP client guide

JamRelay exposes Streamable HTTP at `/mcp`. A client needs MCP HTTP transport plus one supported authentication path.

## Bearer key

```text
Server URL: https://mcp.example.com/mcp
Authorization: Bearer YOUR_MCP_API_KEY
```

Use this mainly for development, debugging, or clients with custom headers. The key permits every MCP tool exposed by the deployment. Never give a client `MCP_OAUTH_OWNER_SECRET`, `SPOTIFY_CLIENT_SECRET`, or `TOKEN_ENCRYPTION_KEY`.

## OAuth discovery flow

A modern automatic client can:

1. call `/mcp` and receive `401` plus protected-resource metadata;
2. discover the authorization server;
3. use an existing pre-registered client ID or call `/oauth/register` when DCR is enabled;
4. open `/oauth/authorize` with PKCE `S256`;
5. let the JamRelay owner approve the connection;
6. receive an authorization code plus `iss`;
7. exchange the code at `/oauth/token`;
8. call `/mcp` with the opaque access token;
9. rotate the refresh token when refreshing.

JamRelay supports multiple pre-registered clients and Dynamic Client Registration, so several MCP hosts can use the same deployment without replacing one global redirect URI.

## Client types

- **Hosted web clients:** typically use HTTPS callbacks.
- **Native/CLI clients:** typically use loopback HTTP callbacks on localhost and can use DCR.
- **Public clients:** use PKCE with no client secret.
- **Confidential clients:** authenticate to the token endpoint with a client secret.

## Smoke test

Use MCP Inspector or another client to verify `initialize`, `tools/list`, and one read-only `tools/call`. Repository tests cover transport and OAuth protocol behavior; third-party UI verification is tracked separately in the client docs.
