---
title: ChatGPT
translationReviewed: 2026-09-12
sourceHash: 0b1728a880f4
---

# ChatGPT

TuneLink może działać jako zdalna aplikacja MCP ChatGPT przez publiczny endpoint HTTPS.

## Zalecany tryb

Dla ChatGPT użyj **pre-registered confidential OAuth client**. ChatGPT pokazuje dokładny callback podczas konfiguracji. Skopiuj go bez zmian.

```dotenv
MCP_OAUTH_CLIENT_ID=chatgpt-tunelink
MCP_OAUTH_CLIENT_SECRET=<MOCNY_LOSOWY_SEKRET>
MCP_OAUTH_REDIRECT_URI=<DOKLADNY_CALLBACK_Z_CHATGPT>
MCP_OAUTH_OWNER_SECRET=<SEKRET_WLASCICIELA>
```

Możesz też umieścić klienta ChatGPT w `MCP_OAUTH_CLIENTS_PATH`. DCR może pozostać włączone dla pozostałych klientów.

## Ustawienia w ChatGPT

```text
Server URL: https://mcp.example.com/mcp
Authentication: OAuth
Authorization URL: https://mcp.example.com/oauth/authorize
Token URL: https://mcp.example.com/oauth/token
Authorization server / issuer: https://mcp.example.com
Resource: https://mcp.example.com/mcp
Token endpoint authentication: client_secret_basic
```

Nie używaj tutaj Spotify Client ID ani Spotify Client Secret. Przy rozpoczęciu logowania TuneLink pokaże stronę owner approval — wpisujesz tam `MCP_OAUTH_OWNER_SECRET`, którego nie przekazujesz ChatGPT.

## Weryfikacja

ChatGPT jest ścieżką zweryfikowaną end-to-end w tym projekcie. Test odczytu: `What is currently playing on Spotify?`; test zapisu: utworzenie prywatnej playlisty testowej.
