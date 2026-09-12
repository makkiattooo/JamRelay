---
title: Gemini CLI
translationReviewed: 2026-09-12
sourceHash: e91822d2ce2d
---

# Gemini CLI

Gemini CLI prend en charge Streamable HTTP, la découverte OAuth automatique et DCR. Le mode recommandé est **DCR public client + PKCE**.

```bash
gemini mcp add --transport http tunelink https://mcp.example.com/mcp
```

Puis `/mcp auth tunelink`. Gemini peut enregistrer `http://localhost:<port>/oauth/callback`. TuneLink renvoie `iss`, requis par Gemini selon RFC 9207.

Fallback Bearer pour le debug:

```bash
gemini mcp add --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" tunelink https://mcp.example.com/mcp
```

Le chemin protocolaire est implémenté; le build Gemini CLI actuel reste à tester de bout en bout.
