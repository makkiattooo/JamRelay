---
title: Cursor
translationReviewed: 2026-09-12
sourceHash: f593d026dd37
---

# Cursor

Cursor wspiera zdalny Streamable HTTP, OAuth, statyczne credentials OAuth oraz custom headers.

Minimalna konfiguracja OAuth/DCR:

```json
{
  "mcpServers": {
    "tunelink": { "url": "https://mcp.example.com/mcp" }
  }
}
```

Aktualne callbacki dokumentowane przez Cursor:

```text
Web / Cursor Agents: https://www.cursor.com/agents/mcp/oauth/callback
Desktop: http://localhost:8787/callback
```

Dla konkretnej wersji można też użyć static OAuth:

```json
{
  "mcpServers": {
    "tunelink": {
      "url": "https://mcp.example.com/mcp",
      "auth": {
        "CLIENT_ID": "${env:TUNELINK_OAUTH_CLIENT_ID}",
        "CLIENT_SECRET": "${env:TUNELINK_OAUTH_CLIENT_SECRET}"
      }
    }
  }
}
```

Albo Bearer w `headers.Authorization`. Status: ścieżka protokołu jest zaimplementowana, ale bieżący Cursor nie jest jeszcze oznaczony jako ręcznie zweryfikowany w tym release.
