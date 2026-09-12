---
title: VS Code + GitHub Copilot
translationReviewed: 2026-09-12
sourceHash: ec7aac770df2
---

# VS Code + GitHub Copilot

VS Code unterstützt Remote-MCP und OAuth. Laut aktuellem Microsoft-Guide wird zuerst **DCR** versucht und anschließend auf konfigurierte Client-Zugangsdaten zurückgefallen.

```json
{ "servers": { "tunelink": { "type": "http", "url": "https://mcp.example.com/mcp" } } }
```

Dokumentierte Redirects:

```text
http://127.0.0.1:33418
https://vscode.dev/redirect
```

Ein statischer Public Client kann mit `tokenEndpointAuthMethods: ["none"]` und beiden Redirects registriert werden. Protokollpfad implementiert; aktueller VS-Code/Copilot-Build noch separat testen.
