# HTTP endpoint reference

The application is an Express server. URLs are relative to `PUBLIC_BASE_URL`.
The MCP endpoint is the endpoint intended for an AI client to call repeatedly;
provider and MCP OAuth routes are browser/protocol endpoints. `/health` reports
server/database readiness and provider status separately; a connected Spotify
account is not required.

## Endpoint map

| Method                | Path                                        | Auth                    | Purpose                                  |
| --------------------- | ------------------------------------------- | ----------------------- | ---------------------------------------- |
| `GET`                 | `/health`                                   | none                    | Liveness and connection summary          |
| `GET`                 | `/auth/status`                              | none                    | Provider connection summary              |
| `GET`                 | `/auth/providers/:provider/start`           | none                    | Generic provider onboarding entrypoint   |
| `GET`                 | `/auth/providers/:provider/callback`        | provider state          | Completes provider authorization         |
| `GET`                 | `/owner/login`                              | none                    | Owner session login page                 |
| `POST`                | `/owner/login`                              | owner secret            | Creates an HttpOnly owner session        |
| `POST`                | `/owner/logout`                             | owner session           | Invalidates the owner session            |
| `GET`                 | `/admin` and `/admin/*`                     | owner session           | Owner administration console pages       |
| `POST`                | `/admin/logout`                             | owner + CSRF            | Invalidates the owner session            |
| `POST`                | `/admin/backups/create`                     | owner + CSRF            | Creates an application-aware backup      |
| `GET`                 | `/connections`                              | owner session           | Connection Hub inventory                 |
| `GET/PATCH/DELETE`    | `/connections/:connectionId`                | owner + CSRF for writes | Inspect or manage one connection         |
| `GET`                 | `/owner/grants`                             | owner session           | List MCP grants                          |
| `PATCH/DELETE`        | `/owner/grants/:clientId`                   | owner + CSRF            | Modify or revoke an MCP grant            |
| `GET`                 | `/auth/providers/:provider/start`           | none                    | Starts provider authorization            |
| `GET`                 | `/auth/providers/:provider/callback`        | provider state          | Completes provider authorization         |
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

`/health` returns `status`, `spotifyConnected`, the application version, the MCP URL, and a database object with `status`, `schemaVersion`, `expectedVersion`, and `schemaState`. `schemaState` is `current` for the matching release or `ahead` for a compatible older rollback image. `/auth/status` returns `spotifyConnected` and `reauthorizationRequired`.

## Spotify authorization

1. Open `/auth/providers/spotify/start`.
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

Protected-resource metadata advertises `/mcp`, the authorization server, and Bearer header usage. JamRelay serves both the root and path-suffixed RFC 9728 discovery URLs.

Authorization-server metadata advertises:

- authorization-code and refresh-token grants;
- PKCE `S256`;
- public clients (`none`);
- `client_secret_basic`;
- `client_secret_post`;
- `/oauth/register` when DCR is enabled.

JamRelay resolves OAuth clients from the static multi-client registry or the dynamic-client store.

Owner routes are separate from provider OAuth routes. Provider OAuth creates or
refreshes a provider connection; MCP OAuth creates a client grant over the
connections and permissions selected on its consent screen.
