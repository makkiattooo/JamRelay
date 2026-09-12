---
title: Windsurf Cascade
translationReviewed: 2026-09-12
sourceHash: b54df15d155e
---

# Windsurf Cascade

Windsurf admite `stdio`, Streamable HTTP, SSE y OAuth para MCP. Usa `https://mcp.example.com/mcp`. La documentación pública confirma OAuth, pero describe el registro y los callbacks con menos detalle que Gemini, Cursor o VS Code. Por eso el estado sigue siendo «compatible por protocolo, aún no verificado end-to-end».

Puedes usar Bearer como fallback mediante `headers.Authorization`. Windsurf documenta un límite de 100 herramientas MCP disponibles al mismo tiempo; TuneLink está por debajo.
