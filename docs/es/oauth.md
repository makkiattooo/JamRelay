---
title: MCP OAuth
translationReviewed: 2026-09-12
sourceHash: 3035042a0b24
---

# MCP OAuth

JamRelay tiene dos capas de autorización independientes: **cliente de IA → JamRelay** y **JamRelay → Spotify**. MCP OAuth no sustituye Spotify OAuth.

## Funciones compatibles

Authorization Code, PKCE `S256` obligatorio, validación exacta de Redirect URI, `iss` RFC 9207, metadata RFC 9728, access tokens de una hora, refresh tokens rotativos, clientes públicos (`none`), clientes confidenciales (`client_secret_basic` / `client_secret_post`), registro estático multi-cliente, DCR RFC 7591 y aprobación del propietario mediante `MCP_OAUTH_OWNER_SECRET`.

## Clientes automáticos

```dotenv
PUBLIC_BASE_URL=https://mcp.example.com
MCP_OAUTH_OWNER_SECRET=<STRONG_RANDOM_SECRET>
MCP_OAUTH_DCR_ENABLED=true
```

El cliente puede descubrir automáticamente metadata, `/oauth/register`, `/oauth/authorize` y `/oauth/token`.

## ChatGPT existente

```dotenv
MCP_OAUTH_CLIENT_ID=chatgpt-jamrelay
MCP_OAUTH_CLIENT_SECRET=<STRONG_RANDOM_SECRET>
MCP_OAUTH_REDIRECT_URI=<EXACT_CALLBACK_FROM_CHATGPT>
MCP_OAUTH_OWNER_SECRET=<OWNER_APPROVAL_SECRET>
```

Puede coexistir con DCR y el registro multi-cliente.

## Seguridad DCR

`POST /oauth/register` no está autenticado por diseño, pero registrarse **no concede acceso a Spotify**. El código solo se emite después de la aprobación del propietario. JamRelay aplica rate limiting, límites, pruning, S256, validación de callbacks y almacenamiento hash de secretos dinámicos.

DCR se puede desactivar con `MCP_OAUTH_DCR_ENABLED=false`. Los clientes nativos pueden registrar callbacks loopback.

Store local: `./data/mcp-oauth.json`; Docker: `/data/mcp-oauth.json`.

## CIMD

MCP 2026-07-28 prefiere CIMD y depreca DCR a largo plazo. JamRelay v1.0.0 no anuncia CIMD porque una implementación segura necesita obtener metadata controlada por el cliente con protección SSRF/DNS rebinding.
