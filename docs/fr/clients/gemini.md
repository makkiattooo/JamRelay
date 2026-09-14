---
title: Gemini CLI
translationReviewed: 2026-09-12
sourceHash: 1b85be5d8525
---

# Gemini CLI

Gemini CLI prend en charge Streamable HTTP, la découverte OAuth automatique et DCR. Le mode recommandé est **DCR public client + PKCE**.

```bash
gemini mcp add --transport http jamrelay https://mcp.example.com/mcp
```

Puis `/mcp auth jamrelay`. Gemini peut enregistrer `http://localhost:<port>/oauth/callback`. JamRelay renvoie `iss`, requis par Gemini selon RFC 9207.

Fallback Bearer pour le debug:

```bash
gemini mcp add --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" jamrelay https://mcp.example.com/mcp
```

Le chemin protocolaire est implémenté; le build Gemini CLI actuel reste à tester de bout en bout.
