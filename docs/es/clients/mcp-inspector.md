---
title: MCP Inspector
translationReviewed: 2026-09-12
sourceHash: 44ed924f9d86
---

# MCP Inspector

MCP Inspector sirve para probar discovery, OAuth/DCR, PKCE, Bearer, `tools/list` y llamadas de herramientas.

```bash
npx @modelcontextprotocol/inspector --cli https://mcp.example.com/mcp --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" --method tools/list
```

Para OAuth ejecuta `npx @modelcontextprotocol/inspector`, elige Streamable HTTP e introduce `https://mcp.example.com/mcp`. El smoke test de release debe cubrir 401 + metadata, DCR, S256, `iss`, código de un solo uso, access token y rotación de refresh token.
