---
title: Windsurf Cascade
translationReviewed: 2026-09-12
sourceHash: cc8980f1a2e3
---

# Windsurf Cascade

Windsurf wspiera `stdio`, Streamable HTTP, SSE oraz OAuth dla MCP. Dodaj endpoint `https://mcp.example.com/mcp`.

Publiczna dokumentacja Windsurf potwierdza OAuth, ale nie opisuje tak jednoznacznie modelu rejestracji/callbacków jak Gemini, Cursor czy VS Code. Dlatego JamRelay nie obiecuje jeszcze pełnej weryfikacji end-to-end.

Fallback do debugowania:

```json
{
  "mcpServers": {
    "jamrelay": {
      "serverUrl": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ${env:JAMRELAY_API_KEY}" }
    }
  }
}
```

Windsurf dokumentuje limit 100 narzędzi MCP dostępnych jednocześnie; JamRelay ma obecnie mniej niż ten limit.
