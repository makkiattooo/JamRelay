---
title: MCP Inspector
translationReviewed: 2026-09-12
sourceHash: ad29e26c41ee
---

# MCP Inspector

MCP Inspector służy do niezależnego testowania discovery, OAuth/DCR, PKCE, Bearera, `tools/list` i wywołań narzędzi.

Bearer:

```bash
npx @modelcontextprotocol/inspector --cli https://mcp.example.com/mcp --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" --method tools/list
```

OAuth: uruchom `npx @modelcontextprotocol/inspector`, wybierz Streamable HTTP i wpisz `https://mcp.example.com/mcp`. Pozwól Inspectorowi najpierw wykonać discovery.

Release smoke test powinien sprawdzić 401 + resource metadata, protected-resource metadata, authorization-server metadata, DCR, S256 PKCE, `iss`, jednorazowość code, działający access token i rotację refresh tokenów.
