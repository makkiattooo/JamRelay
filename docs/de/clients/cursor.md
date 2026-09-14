---
title: Cursor
translationReviewed: 2026-09-12
sourceHash: 041b38f3f79a
---

# Cursor

Cursor unterstützt Remote Streamable HTTP, OAuth, statische OAuth-Zugangsdaten und eigene Header. Minimal für DCR:

```json
{ "mcpServers": { "jamrelay": { "url": "https://mcp.example.com/mcp" } } }
```

Aktuell dokumentierte Callbacks:

```text
Web / Cursor Agents: https://www.cursor.com/agents/mcp/oauth/callback
Desktop: http://localhost:8787/callback
```

Als Alternative kann ein statischer Client in `MCP_OAUTH_CLIENTS_PATH` registriert oder ein Bearer-Header verwendet werden. Der Protokollpfad ist implementiert; ein aktueller Cursor-Build ist noch separat Ende-zu-Ende zu testen.
