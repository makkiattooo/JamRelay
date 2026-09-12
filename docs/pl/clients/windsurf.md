---
title: Windsurf Cascade
translationReviewed: 2026-09-12
sourceHash: 81cdf5f61e8a
---

# Windsurf Cascade

Windsurf wspiera `stdio`, Streamable HTTP, SSE oraz OAuth dla MCP. Dodaj endpoint `https://mcp.example.com/mcp`.

Publiczna dokumentacja Windsurf potwierdza OAuth, ale nie opisuje tak jednoznacznie modelu rejestracji/callbacków jak Gemini, Cursor czy VS Code. Dlatego TuneLink nie obiecuje jeszcze pełnej weryfikacji end-to-end.

Fallback do debugowania:

```json
{
  "mcpServers": {
    "tunelink": {
      "serverUrl": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ${env:TUNELINK_API_KEY}" }
    }
  }
}
```

Windsurf dokumentuje limit 100 narzędzi MCP dostępnych jednocześnie; TuneLink ma obecnie mniej niż ten limit.
