---
title: HTTP-Endpunktreferenz
translationReviewed: 2026-09-12
sourceHash: 72f34abdd171
---

# HTTP-Endpunktreferenz

| Methode               | Pfad                                        | Auth              | Zweck                      |
| --------------------- | ------------------------------------------- | ----------------- | -------------------------- |
| `GET`                 | `/health`                                   | keine             | Liveness/Status            |
| `GET`                 | `/auth/status`                              | keine             | Spotify-Status             |
| `GET`                 | `/auth/providers/:provider/start`           | keine             | Provider-OAuth starten     |
| `GET`                 | `/auth/providers/:provider/callback`        | Provider-State    | Provider-OAuth abschließen |
| `GET`                 | `/.well-known/oauth-protected-resource`     | keine             | Resource Metadata          |
| `GET`                 | `/.well-known/oauth-protected-resource/mcp` | keine             | RFC 9728 Metadata          |
| `GET`                 | `/.well-known/oauth-authorization-server`   | keine             | Authorization Metadata     |
| `POST`                | `/oauth/register`                           | rate-limited      | DCR                        |
| `GET/POST`            | `/oauth/authorize`                          | Owner Approval    | Authorization Code         |
| `POST`                | `/oauth/token`                              | OAuth Client      | Code/Refresh Exchange      |
| `GET/POST/DELETE/...` | `/mcp`                                      | Bearer oder OAuth | Streamable HTTP            |

Ohne gültige Credentials liefert `/mcp` `401` und `WWW-Authenticate` mit Resource-Metadata-Hinweis. Die Authorization-Metadaten bewerben S256, Public/Confidential Clients und `/oauth/register`, wenn DCR aktiv ist.
