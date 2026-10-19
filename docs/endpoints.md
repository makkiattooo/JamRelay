# HTTP endpoints

| Method           | Path                                        | Authorization                                | Purpose                                                        |
| ---------------- | ------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| GET              | `/health`                                   | Public                                       | Readiness, version and non-personal schema status              |
| GET              | `/owner/login`                              | Public                                       | Login form with CSRF nonce                                     |
| POST             | `/owner/login`                              | Owner secret + login CSRF                    | Short-lived owner session; rate limited                        |
| POST             | `/owner/logout`                             | Owner session + CSRF                         | Invalidate session                                             |
| GET              | `/auth/providers/:provider/start`           | Owner session                                | Confirm exact connection/replacement; no external redirect yet |
| POST             | `/auth/providers/:provider/start`           | Owner session + CSRF                         | Record one-time approval and redirect to provider              |
| GET              | `/auth/providers/:provider/callback`        | Same owner session + approved one-time state | Validate state/PKCE and save credentials                       |
| GET/POST         | `/auth/spotify/login`                       | Same checks as provider start                | Legacy Spotify alias                                           |
| GET              | `/auth/spotify/callback`                    | Same checks as provider callback             | Legacy Spotify alias                                           |
| POST             | `/auth/apple-music/user-token`              | `x-jamrelay-owner-secret` header             | Configure Music User Token; rate limited                       |
| GET              | `/.well-known/oauth-protected-resource`     | Public                                       | MCP resource metadata                                          |
| GET              | `/.well-known/oauth-protected-resource/mcp` | Public                                       | Path-suffixed resource metadata                                |
| GET              | `/.well-known/oauth-authorization-server`   | Public                                       | MCP authorization server metadata                              |
| POST             | `/oauth/register`                           | Public, rate limited                         | DCR when enabled                                               |
| GET/POST         | `/oauth/authorize`                          | MCP request validation + owner consent       | MCP grants; separate from provider OAuth                       |
| POST             | `/oauth/token`                              | OAuth client + code/refresh credentials      | MCP token exchange                                             |
| HTTP MCP methods | `/mcp`                                      | Static bearer or granted MCP OAuth           | MCP transport                                                  |

Browser authorization supports `spotify`, `soundcloud`, and `youtube`. Apple Music uses its existing token mechanism. No owner secret belongs in a URL. Login cookies are HttpOnly, SameSite=Lax, Path=/ and Secure for an HTTPS public origin or production. Login sessions last 30 minutes; provider initiations last 10 minutes and do not survive restart.

Version 1.4 removes the web management routes, including `/admin`, `/connections`, `/providers`, `/auth/status`, `/owner/grants` and session rotation. They return 404. Use the [local CLI](/operations) and new login/logout for these workflows. Public health no longer reveals provider account or connection summaries.
