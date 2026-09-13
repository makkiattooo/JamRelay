---
title: Ogólny klient MCP
translationReviewed: 2026-09-12
sourceHash: 92b47c049402
---

# Ogólny klient MCP

JamRelay udostępnia Streamable HTTP pod `/mcp`. Klient potrzebuje transportu HTTP MCP i jednej wspieranej ścieżki auth.

## Bearer

```text
Server URL: https://mcp.example.com/mcp
Authorization: Bearer YOUR_MCP_API_KEY
```

Bearer najlepiej traktować jako tryb development/debug. Nigdy nie przekazuj klientowi `MCP_OAUTH_OWNER_SECRET`, `SPOTIFY_CLIENT_SECRET` ani `TOKEN_ENCRYPTION_KEY`.

## OAuth discovery

Nowoczesny klient może otrzymać 401, odkryć resource/auth metadata, użyć klienta pre-registered albo DCR, otworzyć `/oauth/authorize` z S256, przejść owner approval, odebrać `code + iss`, wymienić kod i później rotować refresh tokeny.

Hosted web clients zwykle używają callbacków HTTPS; native/CLI — loopback; public clients używają PKCE bez secretu; confidential clients uwierzytelniają się client secretem.
