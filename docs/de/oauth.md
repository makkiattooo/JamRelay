---
title: MCP OAuth
translationReviewed: 2026-09-12
sourceHash: a9cb47be34b8
---

# MCP OAuth

JamRelay besitzt zwei unabhängige Autorisierungsebenen: **AI-Client → JamRelay** und **JamRelay → Spotify**. MCP OAuth ersetzt Spotify OAuth nicht.

## Unterstützte Funktionen

- Authorization Code;
- verpflichtendes PKCE `S256`;
- exakte Redirect-URI-Prüfung pro Client;
- RFC 9207 `iss`;
- RFC 9728 Protected-Resource-Metadaten für Root und `/mcp`;
- Access Tokens für eine Stunde;
- rotierende Refresh Tokens;
- Public Clients mit `token_endpoint_auth_method=none`;
- Confidential Clients mit `client_secret_basic` oder `client_secret_post`;
- statische Multi-Client-Registry;
- RFC 7591 DCR zur Kompatibilität mit ausgelieferten Clients;
- Owner Approval über `MCP_OAUTH_OWNER_SECRET`.

## Automatische Clients

```dotenv
PUBLIC_BASE_URL=https://mcp.example.com
MCP_OAUTH_OWNER_SECRET=<STRONG_RANDOM_SECRET>
MCP_OAUTH_DCR_ENABLED=true
```

Discovery verwendet `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/authorize` und `/oauth/token`.

## Bestehendes ChatGPT-Setup

```dotenv
MCP_OAUTH_CLIENT_ID=chatgpt-jamrelay
MCP_OAUTH_CLIENT_SECRET=<STRONG_RANDOM_SECRET>
MCP_OAUTH_REDIRECT_URI=<EXACT_CALLBACK_FROM_CHATGPT>
MCP_OAUTH_OWNER_SECRET=<OWNER_APPROVAL_SECRET>
```

Dieser Client kann gleichzeitig mit DCR und der statischen Multi-Client-Registry verwendet werden.

## Mehrere statische Clients

Setze `MCP_OAUTH_CLIENTS_PATH` und beginne mit `examples/mcp-oauth-clients.example.json`. Ein Client kann mehrere `redirectUris` besitzen; Public Clients können `tokenEndpointAuthMethods: ["none"]` verwenden.

## DCR-Sicherheit

`POST /oauth/register` ist protokollbedingt nicht authentifiziert, aber eine Registrierung **gewährt keinen Spotify-Zugriff**. Erst Owner Approval erlaubt die Ausgabe eines Authorization Codes. JamRelay begrenzt und bereinigt dynamische Registrierungen, erzwingt S256, prüft Redirects und speichert dynamische Secrets gehasht.

DCR kann mit `MCP_OAUTH_DCR_ENABLED=false` deaktiviert werden. Native Clients dürfen Loopback-HTTP-Callbacks registrieren.

## Persistenter Store

Lokal: `./data/mcp-oauth.json`; Docker Production: `/data/mcp-oauth.json`.

## CIMD

MCP 2026-07-28 bevorzugt Client ID Metadata Documents und deprecates DCR langfristig. JamRelay v1.0.0 bewirbt CIMD bewusst nicht, da dafür client-gesteuerte Metadaten sicher geladen und SSRF/DNS-Rebinding abgewehrt werden müssten.
