---
title: Client MCP générique
translationReviewed: 2026-09-12
sourceHash: 92b47c049402
---

# Client MCP générique

TuneLink expose Streamable HTTP sur `/mcp`. Le client doit disposer du transport MCP HTTP et d’un chemin d’authentification pris en charge.

Bearer : `Authorization: Bearer YOUR_MCP_API_KEY`. Ne donnez jamais au client `MCP_OAUTH_OWNER_SECRET`, `SPOTIFY_CLIENT_SECRET` ou `TOKEN_ENCRYPTION_KEY`.

Un client OAuth moderne peut recevoir 401 + resource metadata, découvrir l’authorization server, utiliser un client pré-enregistré ou DCR, faire PKCE S256, obtenir `code + iss`, échanger le code et faire tourner les refresh tokens. Les clients web utilisent généralement HTTPS; les clients natifs/CLI utilisent des callbacks loopback.
