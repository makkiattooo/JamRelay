---
title: Compatibilidad de clientes de IA
translationReviewed: 2026-09-12
sourceHash: 92ba01eb8652
---

# Compatibilidad de clientes de IA

Endpoint remoto: `https://mcp.example.com/mcp`. JamRelay admite MCP OAuth y Bearer estático opcional.

| Cliente           | HTTP remoto | OAuth | Modo recomendado         | Estado                         |
| ----------------- | ----------- | ----- | ------------------------ | ------------------------------ |
| ChatGPT           | ✅          | ✅    | OAuth estático           | verificado end-to-end          |
| Claude            | ✅          | ✅    | DCR                      | ruta de protocolo implementada |
| Gemini CLI        | ✅          | ✅    | DCR                      | ruta de protocolo implementada |
| Cursor            | ✅          | ✅    | DCR o estático           | ruta de protocolo implementada |
| VS Code / Copilot | ✅          | ✅    | DCR                      | ruta de protocolo implementada |
| Windsurf          | ✅          | ✅    | discovery OAuth / Bearer | aún no verificado end-to-end   |
| MCP Inspector     | ✅          | ✅    | OAuth o Bearer           | herramienta de prueba          |

Una instancia puede servir simultáneamente cliente legacy, registro estático multi-cliente, DCR, clientes públicos y confidenciales. CIMD todavía no se anuncia.
