---
title: MCP Inspector
translationReviewed: 2026-09-12
sourceHash: 561e3e267759
---

# MCP Inspector

MCP Inspector permet de tester discovery, OAuth/DCR, PKCE, Bearer, `tools/list` et les appels d’outils.

```bash
npx @modelcontextprotocol/inspector --cli https://mcp.example.com/mcp --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" --method tools/list
```

Pour OAuth, lancez `npx @modelcontextprotocol/inspector`, choisissez Streamable HTTP et saisissez `https://mcp.example.com/mcp`. Le smoke test de release doit couvrir 401 + metadata, DCR, S256, `iss`, code à usage unique, access token et rotation du refresh token.
