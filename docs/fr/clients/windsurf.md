---
title: Windsurf Cascade
translationReviewed: 2026-09-12
sourceHash: b54df15d155e
---

# Windsurf Cascade

Windsurf prend en charge `stdio`, Streamable HTTP, SSE et OAuth pour MCP. Utilisez `https://mcp.example.com/mcp`. La documentation publique confirme OAuth mais décrit moins précisément l’enregistrement et les callbacks que Gemini, Cursor ou VS Code. Le statut reste donc « compatible par protocole, pas encore vérifié de bout en bout ».

Un fallback Bearer peut être envoyé via `headers.Authorization`. Windsurf documente une limite de 100 outils MCP disponibles simultanément; TuneLink reste en dessous.
