---
title: Compatibilité des clients IA
translationReviewed: 2026-09-12
sourceHash: 92ba01eb8652
---

# Compatibilité des clients IA

Endpoint distant : `https://mcp.example.com/mcp`. TuneLink prend en charge MCP OAuth et un Bearer statique optionnel.

| Client            | HTTP distant | OAuth | Mode recommandé          | Statut                             |
| ----------------- | ------------ | ----- | ------------------------ | ---------------------------------- |
| ChatGPT           | ✅           | ✅    | OAuth statique           | vérifié de bout en bout            |
| Claude            | ✅           | ✅    | DCR                      | chemin protocolaire implémenté     |
| Gemini CLI        | ✅           | ✅    | DCR                      | chemin protocolaire implémenté     |
| Cursor            | ✅           | ✅    | DCR ou statique          | chemin protocolaire implémenté     |
| VS Code / Copilot | ✅           | ✅    | DCR                      | chemin protocolaire implémenté     |
| Windsurf          | ✅           | ✅    | discovery OAuth / Bearer | pas encore vérifié de bout en bout |
| MCP Inspector     | ✅           | ✅    | OAuth ou Bearer          | outil de test                      |

Une seule instance peut servir simultanément un client legacy, un registre statique multi-client, DCR, des clients publics et confidentiels. CIMD n’est pas encore annoncé.
