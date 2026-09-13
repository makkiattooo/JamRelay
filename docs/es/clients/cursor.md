---
title: Cursor
translationReviewed: 2026-09-12
sourceHash: dd20a9dff117
---

# Cursor

Cursor admite Streamable HTTP remoto, OAuth, credenciales OAuth estáticas y headers personalizados. Configuración mínima con DCR:

```json
{ "mcpServers": { "jamrelay": { "url": "https://mcp.example.com/mcp" } } }
```

Callbacks documentados actualmente:

```text
Web / Cursor Agents: https://www.cursor.com/agents/mcp/oauth/callback
Desktop: http://localhost:8787/callback
```

También puedes usar un cliente estático en `MCP_OAUTH_CLIENTS_PATH` o Bearer en headers. La ruta de protocolo está implementada; un build actual de Cursor debe probarse end-to-end por separado.
