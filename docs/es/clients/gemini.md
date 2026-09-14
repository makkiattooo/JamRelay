---
title: Gemini CLI
translationReviewed: 2026-09-12
sourceHash: 1b85be5d8525
---

# Gemini CLI

Gemini CLI admite Streamable HTTP, descubrimiento OAuth automático y DCR. Se recomienda **DCR public client + PKCE**.

```bash
gemini mcp add --transport http jamrelay https://mcp.example.com/mcp
```

Después usa `/mcp auth jamrelay`. Gemini puede registrar `http://localhost:<port>/oauth/callback`. JamRelay devuelve `iss`, obligatorio para Gemini según RFC 9207.

Fallback Bearer para depuración:

```bash
gemini mcp add --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" jamrelay https://mcp.example.com/mcp
```

La ruta de protocolo está implementada; el build actual de Gemini CLI aún debe probarse end-to-end.
