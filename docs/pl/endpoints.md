---
title: Referencja endpointów HTTP
translationReviewed: 2026-09-12
sourceHash: 31dab7d9b5f2
---

# Referencja endpointów HTTP

Wszystkie URL są względne wobec `PUBLIC_BASE_URL`.

| Metoda                | Ścieżka                                     | Auth                     | Cel                             |
| --------------------- | ------------------------------------------- | ------------------------ | ------------------------------- |
| `GET`                 | `/health`                                   | brak                     | liveness/status                 |
| `GET`                 | `/auth/status`                              | brak                     | status Spotify                  |
| `GET`                 | `/auth/providers/:provider/start`           | brak                     | start OAuth providera           |
| `GET`                 | `/auth/providers/:provider/callback`        | stan providera           | zakończenie OAuth providera     |
| `GET`                 | `/.well-known/oauth-protected-resource`     | brak                     | protected-resource metadata     |
| `GET`                 | `/.well-known/oauth-protected-resource/mcp` | brak                     | RFC 9728 path-suffixed metadata |
| `GET`                 | `/.well-known/oauth-authorization-server`   | brak                     | authorization-server metadata   |
| `POST`                | `/oauth/register`                           | brak, rate-limited       | DCR gdy włączone                |
| `GET/POST`            | `/oauth/authorize`                          | owner approval           | wydanie authorization code      |
| `POST`                | `/oauth/token`                              | OAuth client             | wymiana code/refresh tokena     |
| `GET/POST/DELETE/...` | `/mcp`                                      | Bearer/API key lub OAuth | MCP Streamable HTTP             |

## Przykładowy MCP request

```bash
curl -i https://mcp.example.com/mcp \
  -H 'Authorization: Bearer YOUR_MCP_API_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Bez prawidłowego credential `/mcp` zwraca `401` z `WWW-Authenticate` wskazującym protected-resource metadata. Authorization-server metadata reklamuje Authorization Code, refresh tokeny, PKCE `S256`, public clients (`none`), `client_secret_basic`, `client_secret_post` i `/oauth/register`, gdy DCR jest aktywne.
