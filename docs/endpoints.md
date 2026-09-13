# HTTP endpoint reference

The application is an Express server. URLs are relative to `PUBLIC_BASE_URL`. The MCP endpoint is the only endpoint intended for an AI client to call repeatedly; Spotify and MCP OAuth routes are browser/protocol endpoints.

## Endpoint map

| Method                | Path                                        | Auth                    | Purpose                                  |
| --------------------- | ------------------------------------------- | ----------------------- | ---------------------------------------- |
| `GET`                 | `/health`                                   | none                    | Liveness and connection summary          |
| `GET`                 | `/auth/status`                              | none                    | Spotify connection summary               |
| `GET`                 | `/auth/spotify/login`                       | none                    | Starts Spotify authorization             |
| `GET`                 | `/auth/spotify/callback`                    | Spotify state           | Completes Spotify authorization          |
| `GET`                 | `/.well-known/oauth-protected-resource`     | none                    | MCP protected-resource metadata          |
| `GET`                 | `/.well-known/oauth-protected-resource/mcp` | none                    | RFC 9728 path-suffixed metadata          |
| `GET`                 | `/.well-known/oauth-authorization-server`   | none                    | MCP authorization-server metadata        |
| `POST`                | `/oauth/register`                           | none, rate-limited      | Dynamic Client Registration when enabled |
| `GET/POST`            | `/oauth/authorize`                          | owner approval flow     | Displays approval and issues a code      |
| `POST`                | `/oauth/token`                              | OAuth client            | Exchanges a code or refresh token        |
| `GET/POST/DELETE/...` | `/mcp`                                      | bearer/API key or OAuth | MCP Streamable HTTP transport            |

## Health and status

```bash
curl -fsS https://mcp.example.com/health
curl -fsS https://mcp.example.com/auth/status
```

`/health` returns `status`, `spotifyConnected`, the application version, the MCP URL, and a database object with `status`, `schemaVersion`, and `expectedVersion`. A healthy process reports matching schema versions. `/auth/status` returns `spotifyConnected` and `reauthorizationRequired`.

## Spotify authorization

1. Open `/auth/spotify/login`.
2. The server creates a random state and redirects to Spotify with configured scopes.
3. Spotify redirects to the exact `SPOTIFY_REDIRECT_URI`.
4. The server consumes the state once, exchanges the code, and stores encrypted tokens.

User-facing callback failures return generic HTML and do not reveal provider credentials or token data.

## MCP requests

```bash
curl -i https://mcp.example.com/mcp \
  -H 'Authorization: Bearer YOUR_MCP_API_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Without a valid bearer credential, `/mcp` returns `401` with a `WWW-Authenticate` challenge pointing to protected-resource metadata. The server accepts the configured `MCP_API_KEY` when Bearer mode is enabled or a valid opaque MCP OAuth access token.

## OAuth metadata

Protected-resource metadata advertises `/mcp`, the authorization server, and Bearer header usage. TuneLink serves both the root and path-suffixed RFC 9728 discovery URLs.

Authorization-server metadata advertises:

- authorization-code and refresh-token grants;
- PKCE `S256`;
- public clients (`none`);
- `client_secret_basic`;
- `client_secret_post`;
- `/oauth/register` when DCR is enabled.

TuneLink can resolve OAuth clients from the backwards-compatible legacy environment variables, the static multi-client registry, or the dynamic-client store.
