---
title: Claude
translationReviewed: 2026-09-12
sourceHash: f8729d702937
---

# Claude

Claude unterstützt Remote-MCP mit OAuth. TuneLink unterstützt DCR und statische Client-Zugangsdaten.

```dotenv
MCP_OAUTH_OWNER_SECRET=<STARKES_SECRET>
MCP_OAUTH_DCR_ENABLED=true
```

Füge `https://mcp.example.com/mcp` hinzu. Für gehostete Claude-Oberflächen dokumentiert Anthropic `https://claude.ai/api/mcp/auth_callback`; mit DCR wird der Callback automatisch registriert.

Claude Code:

```bash
claude mcp add --transport http tunelink https://mcp.example.com/mcp
```

DCR erlaubt einen Loopback-Callback ohne vorher festgelegten Port. Gehostete Claude-Connectoren benötigen einen öffentlich erreichbaren HTTPS-Endpunkt. Der Protokollpfad ist implementiert; ein aktueller Client-Build ist noch separat Ende-zu-Ende zu testen.
