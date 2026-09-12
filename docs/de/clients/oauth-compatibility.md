---
title: OAuth und mehrere Clients
translationReviewed: 2026-09-12
sourceHash: 26dfccbf5620
---

# OAuth und mehrere Clients

Der MCP-Client erhält niemals Spotify Client Secret, Spotify Refresh Token, Verschlüsselungsschlüssel oder Owner Secret.

Eine Instanz kann gleichzeitig Legacy Pre-Registration, beliebig viele statische Clients aus `MCP_OAUTH_CLIENTS_PATH`, DCR, Public Clients, Confidential Clients und optional `MCP_API_KEY` verwenden.

```text
pre-registration  ✅
DCR               ✅
CIMD              noch nicht beworben
```

| Client     | Dokumentiertes Verhalten                                     | Bester TuneLink-Pfad    |
| ---------- | ------------------------------------------------------------ | ----------------------- |
| ChatGPT    | exakter Callback + Client ID/Secret                          | Static Pre-Registration |
| Claude     | DCR + optionale statische Credentials                        | DCR/static              |
| Gemini CLI | Auto Discovery + DCR + zufälliger localhost Callback + `iss` | DCR Public Client       |
| Cursor     | OAuth, statische Credentials, Web- und Desktop-Callbacks     | DCR/static              |
| VS Code    | DCR zuerst, Fallback zu Client ID                            | DCR                     |
| Windsurf   | OAuth bestätigt, Registrierungsvertrag weniger explizit      | Discovery/Bearer        |
| Inspector  | OAuth/Bearer-Debugging                                       | Testpfad                |

DCR-Ablauf: 401 → Resource Metadata → Authorization Metadata → `/oauth/register` → `/oauth/authorize` mit S256 → Owner Approval → Callback mit `code`, `state`, `iss` → `/oauth/token` → `/mcp`. Eine Registrierung allein gewährt keinen Spotify-Zugriff.

ChatGPT wurde Ende-zu-Ende verifiziert; die übrigen Einträge beschreiben implementierte, an der aktuellen Anbieterdokumentation ausgerichtete Protokollpfade.
