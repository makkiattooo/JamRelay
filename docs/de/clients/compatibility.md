---
title: Client-Kompatibilität
translationReviewed: 2026-09-12
sourceHash: ad52817d5c2d
---

# Client-Kompatibilität

Diese Matrix trennt Protokollkompatibilität von manueller Ende-zu-Ende-Verifikation.

| Client            | OAuth-Pfad                                               | Empfehlung       | Verifikation                                  |
| ----------------- | -------------------------------------------------------- | ---------------- | --------------------------------------------- |
| ChatGPT           | vorregistrierter Confidential Client                     | Static OAuth     | verifiziert                                   |
| Claude            | DCR oder Static Credentials                              | DCR              | Protokoll implementiert; Client erneut testen |
| Gemini CLI        | DCR Public Client                                        | DCR              | Protokoll implementiert; Client erneut testen |
| Cursor            | DCR oder Static Credentials                              | DCR/static       | Protokoll implementiert; Client erneut testen |
| VS Code / Copilot | DCR oder Client ID                                       | DCR              | Protokoll implementiert; Client erneut testen |
| Windsurf          | OAuth laut Anbieter, weniger expliziter Callback-Vertrag | Discovery/Bearer | nicht verifiziert                             |
| MCP Inspector     | DCR/static/Bearer                                        | Testmodus        | Entwicklerwerkzeug                            |

MCP 2026-07-28 bevorzugt CIMD; JamRelay v1.0.0 behält DCR für heutige Client-Kompatibilität.
