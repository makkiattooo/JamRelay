---
title: Konfiguracja
translationReviewed: 2026-09-12
sourceHash: c33366e9f0bd
---

# Konfiguracja

Skopiuj `.env.example` do `.env`. Nie commituj `.env` ani runtime token stores. Kanoniczna tabela zmiennych jest generowana z `.env.example`, więc nie utrzymujemy pięciu ręcznych kopii.

## Storage

Lokalnie:

```text
./data/spotify-token.json
./data/mcp-oauth.json
./data/mcp-oauth-clients.json
```

Docker production:

```text
/data/spotify-token.json
/data/mcp-oauth.json
/data/mcp-oauth-clients.json
```

## MCP authentication

OAuth i opcjonalny Bearer mogą działać równolegle. `MCP_AUTH_MODE=bearer` włącza `MCP_API_KEY`; `MCP_AUTH_MODE=none` wyłącza tylko statyczny API key i **nie** otwiera chronionego przez OAuth `/mcp`. `.env.example` używa `none`, aby świeża konfiguracja nie wymagała pustego Bearer key.

Owner approval:

```dotenv
MCP_OAUTH_OWNER_SECRET=<STRONG_RANDOM_SECRET>
```

DCR:

```dotenv
MCP_OAUTH_DCR_ENABLED=true
```

Klientów statycznych używa się przez `MCP_OAUTH_CLIENTS_PATH` i plik
`examples/mcp-oauth-clients.example.json`.

## Generowanie sekretów

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Używaj osobnych wartości dla encryption key, API key, OAuth client secret i owner secret. `TOKEN_ENCRYPTION_KEY` po dekodowaniu base64 musi mieć dokładnie 32 bajty.
