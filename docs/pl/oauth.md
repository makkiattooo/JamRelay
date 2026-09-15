---
title: MCP OAuth
translationReviewed: 2026-09-12
sourceHash: 3035042a0b24
---

# MCP OAuth

JamRelay ma dwie niezależne warstwy autoryzacji: **klient AI → JamRelay** oraz **JamRelay → Spotify**. MCP OAuth nie zastępuje Spotify OAuth.

## Obsługiwane funkcje

- Authorization Code;
- wymagane PKCE `S256`;
- dokładna walidacja redirect URI dla każdego klienta;
- parametr `iss` zgodny z RFC 9207;
- protected-resource metadata RFC 9728 dla root oraz `/mcp`;
- access token ważny 1 godzinę;
- rotowane refresh tokeny;
- public clients z `token_endpoint_auth_method=none`;
- confidential clients z `client_secret_basic` lub `client_secret_post`;
- statyczny rejestr wielu klientów;
- RFC 7591 Dynamic Client Registration dla kompatybilności z istniejącymi klientami;
- owner approval chronione przez `MCP_OAUTH_OWNER_SECRET`.

## Ekran autoryzacji

`GET /oauth/authorize` jest obsługiwany przez backend JamRelay i wyświetla
markowy, ciemny ekran autoryzacji. Parametry OAuth pozostają w polach formularza
zweryfikowanych przez backend, pełny callback URL nie jest pokazywany, a owner
secret jest przyjmowany wyłącznie w polu typu password. Ekrany autoryzacji mają
`no-store` i restrykcyjną politykę CSP. Anulowanie wraca do zarejestrowanego
callbacku klienta z `error=access_denied` oraz oryginalnym `state`.

## Automatyczni klienci

```dotenv
PUBLIC_BASE_URL=https://mcp.example.com
MCP_OAUTH_OWNER_SECRET=<STRONG_RANDOM_SECRET>
MCP_OAUTH_DCR_ENABLED=true
```

Klient może automatycznie odkryć:

```text
/.well-known/oauth-protected-resource
/.well-known/oauth-protected-resource/mcp
/.well-known/oauth-authorization-server
/oauth/register
/oauth/authorize
/oauth/token
```

## Istniejący ChatGPT nadal działa

```dotenv
MCP_OAUTH_CLIENT_ID=chatgpt-jamrelay
MCP_OAUTH_CLIENT_SECRET=<STRONG_RANDOM_SECRET>
MCP_OAUTH_REDIRECT_URI=<EXACT_CALLBACK_FROM_CHATGPT>
MCP_OAUTH_OWNER_SECRET=<OWNER_APPROVAL_SECRET>
```

Ten klient może działać równocześnie z DCR i statycznym multi-client registry.

## Wiele klientów statycznych

Ustaw `MCP_OAUTH_CLIENTS_PATH` i zacznij od `examples/mcp-oauth-clients.example.json`. Jeden klient może mieć kilka `redirectUris`. Klient publiczny może używać `tokenEndpointAuthMethods: ["none"]`.

## Bezpieczeństwo DCR

`POST /oauth/register` jest niezalogowany z założenia protokołu, ale sama rejestracja **nie daje dostępu do Spotify**. Kod autoryzacyjny jest wydawany dopiero po owner approval. JamRelay dodaje rate limiting, limit dynamicznych klientów, pruning, S256 PKCE, walidację callbacków i hashowanie dynamicznych client secretów.

DCR można wyłączyć:

```dotenv
MCP_OAUTH_DCR_ENABLED=false
```

## Klienci natywni

CLI/desktop może rejestrować callback loopback, np. `http://localhost:49152/oauth/callback`. Klient z `application_type=native` może również używać bezpiecznego private-use URI scheme. Niebezpieczne schematy są odrzucane.

## Trwały store

Lokalnie: `./data/mcp-oauth.json`. W Docker production: `/data/mcp-oauth.json`. Store powinien być prywatny i trwały.

## CIMD

MCP 2026-07-28 preferuje Client ID Metadata Documents (CIMD) i długoterminowo deprecjonuje DCR. JamRelay v1.0.0 celowo nie reklamuje CIMD, ponieważ poprawna implementacja wymaga bezpiecznego pobierania metadata kontrolowanych przez klienta oraz ochrony przed SSRF i DNS rebinding.
