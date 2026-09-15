---
title: AI-Client-Kompatibilität
translationReviewed: 2026-09-12
sourceHash: 55bdab3da45c
---

# AI-Client-Kompatibilität

Remote MCP Streamable HTTP: `https://mcp.example.com/mcp`. JamRelay unterstützt MCP OAuth und optional einen statischen Bearer-Key.

| Client            | Remote HTTP | OAuth | Empfehlung               | Status                              |
| ----------------- | ----------- | ----- | ------------------------ | ----------------------------------- |
| ChatGPT           | ✅          | ✅    | Static OAuth             | Ende-zu-Ende verifiziert            |
| Claude            | ✅          | ✅    | DCR                      | Protokollpfad implementiert         |
| Gemini CLI        | ✅          | ✅    | DCR                      | Protokollpfad implementiert         |
| Cursor            | ✅          | ✅    | DCR oder Static OAuth    | Protokollpfad implementiert         |
| VS Code / Copilot | ✅          | ✅    | DCR                      | Protokollpfad implementiert         |
| Windsurf          | ✅          | ✅    | OAuth Discovery / Bearer | noch nicht Ende-zu-Ende verifiziert |
| MCP Inspector     | ✅          | ✅    | OAuth oder Bearer        | Testwerkzeug                        |

Eine Instanz kann mehrere statische Clients, DCR sowie öffentliche und vertrauliche OAuth-Clients bedienen. CIMD wird noch nicht beworben.
