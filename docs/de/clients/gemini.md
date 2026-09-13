---
title: Gemini CLI
translationReviewed: 2026-09-12
sourceHash: 6da9f76680dd
---

# Gemini CLI

Gemini CLI unterstützt Streamable HTTP, automatische OAuth-Erkennung und DCR. Empfohlen ist **DCR als Public Client mit PKCE**.

```bash
gemini mcp add --transport http jamrelay https://mcp.example.com/mcp
```

Danach `/mcp auth jamrelay`. Gemini kann einen zufälligen `http://localhost:<port>/oauth/callback` registrieren. JamRelay liefert den von Gemini nach RFC 9207 verlangten `iss`-Parameter.

Bearer-Fallback für Debugging:

```bash
gemini mcp add --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" jamrelay https://mcp.example.com/mcp
```

Der Protokollpfad ist implementiert; der aktuelle Gemini-CLI-Build muss noch separat Ende-zu-Ende getestet werden.
