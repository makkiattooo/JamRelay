---
title: VS Code + GitHub Copilot
translationReviewed: 2026-09-12
sourceHash: 2d8662a20b76
---

# VS Code + GitHub Copilot

VS Code prend en charge MCP distant et OAuth. Le guide Microsoft actuel indique que VS Code tente d’abord **DCR**, puis peut utiliser des credentials client configurés.

```json
{ "servers": { "jamrelay": { "type": "http", "url": "https://mcp.example.com/mcp" } } }
```

Redirects documentés:

```text
http://127.0.0.1:33418
https://vscode.dev/redirect
```

Un client public statique peut utiliser `tokenEndpointAuthMethods: ["none"]` avec ces deux redirects. Chemin protocolaire implémenté; build VS Code/Copilot actuel à retester.
