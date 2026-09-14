---
title: Référence des endpoints HTTP
translationReviewed: 2026-09-12
sourceHash: 31dab7d9b5f2
---

# Référence des endpoints HTTP

| Méthode               | Chemin                                      | Auth            | But                    |
| --------------------- | ------------------------------------------- | --------------- | ---------------------- |
| `GET`                 | `/health`                                   | aucune          | liveness/status        |
| `GET`                 | `/auth/status`                              | aucune          | statut Spotify         |
| `GET`                 | `/auth/spotify/login`                       | aucune          | démarrer Spotify OAuth |
| `GET`                 | `/auth/spotify/callback`                    | Spotify state   | terminer Spotify OAuth |
| `GET`                 | `/.well-known/oauth-protected-resource`     | aucune          | resource metadata      |
| `GET`                 | `/.well-known/oauth-protected-resource/mcp` | aucune          | metadata RFC 9728      |
| `GET`                 | `/.well-known/oauth-authorization-server`   | aucune          | authorization metadata |
| `POST`                | `/oauth/register`                           | rate-limited    | DCR                    |
| `GET/POST`            | `/oauth/authorize`                          | approbation     | authorization code     |
| `POST`                | `/oauth/token`                              | client OAuth    | échange code/refresh   |
| `GET/POST/DELETE/...` | `/mcp`                                      | Bearer ou OAuth | Streamable HTTP        |

Sans credential valide, `/mcp` renvoie `401` avec `WWW-Authenticate` vers les resource metadata. Les metadata d’autorisation annoncent S256, clients publics/confidentiels et `/oauth/register` quand DCR est activé.
