---
title: Compatibilidad de clientes
translationReviewed: 2026-09-12
sourceHash: 3b11ae96ea79
---

# Compatibilidad de clientes

Esta matriz separa compatibilidad de protocolo de verificación manual end-to-end.

| Cliente           | Ruta OAuth                                          | Recomendación    | Verificación                                    |
| ----------------- | --------------------------------------------------- | ---------------- | ----------------------------------------------- |
| ChatGPT           | cliente confidencial pre-registrado                 | OAuth estático   | verificado                                      |
| Claude            | DCR o credenciales estáticas                        | DCR              | protocolo implementado; volver a probar cliente |
| Gemini CLI        | cliente público DCR                                 | DCR              | protocolo implementado; volver a probar cliente |
| Cursor            | DCR o credenciales estáticas                        | DCR/estático     | protocolo implementado; volver a probar cliente |
| VS Code / Copilot | DCR o Client ID                                     | DCR              | protocolo implementado; volver a probar cliente |
| Windsurf          | OAuth confirmado, contrato callback menos explícito | discovery/Bearer | no verificado                                   |
| MCP Inspector     | DCR/estático/Bearer                                 | test             | herramienta de desarrollo                       |

MCP 2026-07-28 prefiere CIMD; JamRelay v1.0.0 mantiene DCR para compatibilidad con clientes actuales.
