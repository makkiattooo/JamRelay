---
title: Gemini CLI
translationReviewed: 2026-09-12
sourceHash: e91822d2ce2d
---

# Gemini CLI

Gemini CLI wspiera Streamable HTTP, automatyczne OAuth discovery i DCR. Dla TuneLink zalecane jest **DCR public client + PKCE**.

```dotenv
MCP_OAUTH_OWNER_SECRET=<MOCNY_SEKRET>
MCP_OAUTH_DCR_ENABLED=true
```

```bash
gemini mcp add --transport http tunelink https://mcp.example.com/mcp
```

Następnie użyj `/mcp auth tunelink`. Gemini może zarejestrować losowy callback `http://localhost:<port>/oauth/callback`. TuneLink zwraca parametr `iss` wymagany przez Gemini zgodnie z RFC 9207.

Do debugowania można użyć Bearera:

```bash
gemini mcp add --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" tunelink https://mcp.example.com/mcp
```

Status: ścieżka protokołu jest zaimplementowana; bieżący build Gemini CLI należy osobno przetestować end-to-end.
