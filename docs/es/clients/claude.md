---
title: Claude
translationReviewed: 2026-09-12
sourceHash: efd98c1fa4d9
---

# Claude

Claude admite MCP remoto con OAuth. TuneLink admite DCR y clientes estáticos.

```dotenv
MCP_OAUTH_OWNER_SECRET=<SECRETO_FUERTE>
MCP_OAUTH_DCR_ENABLED=true
```

Añade `https://mcp.example.com/mcp`. Anthropic documenta el callback alojado `https://claude.ai/api/mcp/auth_callback`; con DCR se registra automáticamente.

Claude Code:

```bash
claude mcp add --transport http tunelink https://mcp.example.com/mcp
```

DCR permite registrar un callback loopback sin conocer el puerto de antemano. Las superficies alojadas de Claude requieren un endpoint HTTPS público. La ruta de protocolo está implementada; el build actual del cliente debe probarse end-to-end por separado.
