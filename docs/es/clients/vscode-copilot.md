---
title: VS Code + GitHub Copilot
translationReviewed: 2026-09-12
sourceHash: ec7aac770df2
---

# VS Code + GitHub Copilot

VS Code admite MCP remoto y OAuth. La guía actual de Microsoft indica que primero intenta **DCR** y después puede usar credenciales de cliente configuradas.

```json
{ "servers": { "tunelink": { "type": "http", "url": "https://mcp.example.com/mcp" } } }
```

Redirects documentados:

```text
http://127.0.0.1:33418
https://vscode.dev/redirect
```

Un cliente público estático puede usar `tokenEndpointAuthMethods: ["none"]` con ambos redirects. Ruta de protocolo implementada; el build actual de VS Code/Copilot debe volver a probarse.
