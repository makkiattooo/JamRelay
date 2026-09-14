---
title: Gemini CLI
translationReviewed: 2026-09-12
sourceHash: 1b85be5d8525
---

# Gemini CLI

Gemini CLI wspiera Streamable HTTP, automatyczne OAuth discovery i DCR. Dla JamRelay zalecane jest **DCR public client + PKCE**.

```dotenv
MCP_OAUTH_OWNER_SECRET=<MOCNY_SEKRET>
MCP_OAUTH_DCR_ENABLED=true
```

```bash
gemini mcp add --transport http jamrelay https://mcp.example.com/mcp
```

Następnie użyj `/mcp auth jamrelay`. Gemini może zarejestrować losowy callback `http://localhost:<port>/oauth/callback`. JamRelay zwraca parametr `iss` wymagany przez Gemini zgodnie z RFC 9207.

Do debugowania można użyć Bearera:

```bash
gemini mcp add --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" jamrelay https://mcp.example.com/mcp
```

Status: ścieżka protokołu jest zaimplementowana; bieżący build Gemini CLI należy osobno przetestować end-to-end.
