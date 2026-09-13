---
title: Referencia de endpoints HTTP
translationReviewed: 2026-09-12
sourceHash: 8bb20c99fabe
---

# Referencia de endpoints HTTP

| Método                | Ruta                                        | Auth           | Propósito                |
| --------------------- | ------------------------------------------- | -------------- | ------------------------ |
| `GET`                 | `/health`                                   | ninguna        | liveness/status          |
| `GET`                 | `/auth/status`                              | ninguna        | estado Spotify           |
| `GET`                 | `/auth/spotify/login`                       | ninguna        | iniciar Spotify OAuth    |
| `GET`                 | `/auth/spotify/callback`                    | Spotify state  | terminar Spotify OAuth   |
| `GET`                 | `/.well-known/oauth-protected-resource`     | ninguna        | resource metadata        |
| `GET`                 | `/.well-known/oauth-protected-resource/mcp` | ninguna        | metadata RFC 9728        |
| `GET`                 | `/.well-known/oauth-authorization-server`   | ninguna        | authorization metadata   |
| `POST`                | `/oauth/register`                           | rate-limited   | DCR                      |
| `GET/POST`            | `/oauth/authorize`                          | aprobación     | authorization code       |
| `POST`                | `/oauth/token`                              | cliente OAuth  | intercambio code/refresh |
| `GET/POST/DELETE/...` | `/mcp`                                      | Bearer u OAuth | Streamable HTTP          |

Sin credenciales válidas, `/mcp` devuelve `401` con `WWW-Authenticate` hacia resource metadata. La metadata de autorización anuncia S256, clientes públicos/confidenciales y `/oauth/register` cuando DCR está activo.
