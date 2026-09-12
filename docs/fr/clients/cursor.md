---
title: Cursor
translationReviewed: 2026-09-12
sourceHash: f593d026dd37
---

# Cursor

Cursor prend en charge Streamable HTTP distant, OAuth, les credentials OAuth statiques et les headers personnalisés. Configuration DCR minimale:

```json
{ "mcpServers": { "tunelink": { "url": "https://mcp.example.com/mcp" } } }
```

Callbacks actuellement documentés:

```text
Web / Cursor Agents: https://www.cursor.com/agents/mcp/oauth/callback
Desktop: http://localhost:8787/callback
```

Vous pouvez aussi utiliser un client statique dans `MCP_OAUTH_CLIENTS_PATH` ou un Bearer header. Le chemin protocolaire est implémenté; un build Cursor actuel doit encore être testé de bout en bout.
