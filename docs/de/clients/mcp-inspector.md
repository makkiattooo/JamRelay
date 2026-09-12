---
title: MCP Inspector
translationReviewed: 2026-09-12
sourceHash: ad29e26c41ee
---

# MCP Inspector

MCP Inspector eignet sich zum Testen von Discovery, OAuth/DCR, PKCE, Bearer, `tools/list` und Tool-Aufrufen.

```bash
npx @modelcontextprotocol/inspector --cli https://mcp.example.com/mcp --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" --method tools/list
```

Für OAuth `npx @modelcontextprotocol/inspector` starten, Streamable HTTP auswählen und `https://mcp.example.com/mcp` eintragen. Release-Smoke-Tests sollten 401 + Resource-Metadaten, DCR, S256, `iss`, Einmal-Code, Access Token und Refresh-Rotation abdecken.
