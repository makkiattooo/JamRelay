---
title: VS Code + GitHub Copilot
translationReviewed: 2026-09-12
sourceHash: fb8ca57a672d
---

# VS Code + GitHub Copilot

VS Code obsługuje lokalne i zdalne MCP oraz OAuth dla serwerów HTTP. Według aktualnego guide najpierw próbuje **Dynamic Client Registration**, a gdy DCR nie jest dostępne może użyć skonfigurowanego Client ID.

```json
{
  "servers": {
    "tunelink": {
      "type": "http",
      "url": "https://mcp.example.com/mcp"
    }
  }
}
```

Callbacki udokumentowane przez Microsoft:

```text
http://127.0.0.1:33418
https://vscode.dev/redirect
```

Dla statycznego publicznego klienta ustaw `tokenEndpointAuthMethods: ["none"]` i oba callbacki w registry.

Status: ścieżka protokołu zaimplementowana; konkretny build VS Code/Copilot należy jeszcze przetestować end-to-end.
