---
title: Windsurf Cascade
translationReviewed: 2026-09-12
sourceHash: 81cdf5f61e8a
---

# Windsurf Cascade

Windsurf unterstützt `stdio`, Streamable HTTP, SSE und OAuth für MCP. Verwende `https://mcp.example.com/mcp`. Die öffentliche Windsurf-Dokumentation bestätigt OAuth, beschreibt Registrierung und Callbacks aber weniger eindeutig als Gemini, Cursor oder VS Code. Daher bleibt der Status „protokollkompatibel, noch nicht Ende-zu-Ende verifiziert“.

Bearer-Fallback ist über `headers.Authorization` möglich. Windsurf dokumentiert ein Limit von 100 gleichzeitig verfügbaren MCP-Tools; TuneLink liegt darunter.
