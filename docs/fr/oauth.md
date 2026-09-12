---
title: MCP OAuth
translationReviewed: 2026-09-12
sourceHash: a9cb47be34b8
---

# MCP OAuth

TuneLink possède deux couches d’autorisation indépendantes : **client IA → TuneLink** et **TuneLink → Spotify**. MCP OAuth ne remplace pas Spotify OAuth.

## Fonctions prises en charge

Authorization Code, PKCE `S256` obligatoire, validation exacte des Redirect URI, `iss` RFC 9207, metadata RFC 9728, access tokens d’une heure, refresh tokens rotatifs, clients publics (`none`), clients confidentiels (`client_secret_basic` / `client_secret_post`), registre multi-client statique, DCR RFC 7591 et approbation propriétaire via `MCP_OAUTH_OWNER_SECRET`.

## Clients automatiques

```dotenv
PUBLIC_BASE_URL=https://mcp.example.com
MCP_OAUTH_OWNER_SECRET=<STRONG_RANDOM_SECRET>
MCP_OAUTH_DCR_ENABLED=true
```

Le client peut découvrir automatiquement les metadata, `/oauth/register`, `/oauth/authorize` et `/oauth/token`.

## ChatGPT existant

```dotenv
MCP_OAUTH_CLIENT_ID=chatgpt-tunelink
MCP_OAUTH_CLIENT_SECRET=<STRONG_RANDOM_SECRET>
MCP_OAUTH_REDIRECT_URI=<EXACT_CALLBACK_FROM_CHATGPT>
MCP_OAUTH_OWNER_SECRET=<OWNER_APPROVAL_SECRET>
```

Cette configuration peut coexister avec DCR et le registre multi-client.

## Sécurité DCR

`POST /oauth/register` n’est pas authentifié par conception, mais l’enregistrement **ne donne pas accès à Spotify**. Un code n’est émis qu’après l’approbation propriétaire. TuneLink applique rate limiting, limites, pruning, S256, validation des callbacks et stockage hashé des secrets dynamiques.

DCR peut être désactivé avec `MCP_OAUTH_DCR_ENABLED=false`. Les clients natifs peuvent enregistrer des callbacks loopback.

Store local : `./data/mcp-oauth.json`; Docker : `/data/mcp-oauth.json`.

## CIMD

MCP 2026-07-28 préfère CIMD et déprécie DCR à long terme. TuneLink v1.0.0 n’annonce pas CIMD car une implémentation sûre nécessite de charger des metadata contrôlées par le client avec protection SSRF/DNS rebinding.
