---
title: Gemini CLI
translationReviewed: 2026-09-12
sourceHash: e91822d2ce2d
---

# Gemini CLI

Gemini CLI admite Streamable HTTP, descubrimiento OAuth automático y DCR. Se recomienda **DCR public client + PKCE**.

```bash
gemini mcp add --transport http tunelink https://mcp.example.com/mcp
```

Después usa `/mcp auth tunelink`. Gemini puede registrar `http://localhost:<port>/oauth/callback`. TuneLink devuelve `iss`, obligatorio para Gemini según RFC 9207.

Fallback Bearer para depuración:

```bash
gemini mcp add --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" tunelink https://mcp.example.com/mcp
```

La ruta de protocolo está implementada; el build actual de Gemini CLI aún debe probarse end-to-end.
