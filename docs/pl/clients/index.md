---
title: Kompatybilność klientów AI
translationReviewed: 2026-09-12
sourceHash: 32f5c2c03ded
---

# Kompatybilność klientów AI

TuneLink udostępnia zdalny MCP Streamable HTTP pod:

```text
https://mcp.example.com/mcp
```

Obsługuje **MCP OAuth** oraz opcjonalny statyczny **Bearer** do debugowania albo klientów z własnymi nagłówkami HTTP.

## Multi-client OAuth

Jedna instancja może jednocześnie obsługiwać:

```text
legacy single static client     ✅ zgodność wsteczna
multi-client static registry    ✅
Dynamic Client Registration     ✅
public OAuth clients            ✅
confidential OAuth clients      ✅
CIMD                            jeszcze nie reklamowane
```

| Klient            | Remote HTTP | OAuth | Zalecany tryb                     | Status                             |
| ----------------- | ----------- | ----- | --------------------------------- | ---------------------------------- |
| ChatGPT           | ✅          | ✅    | static OAuth                      | zweryfikowane end-to-end           |
| Claude            | ✅          | ✅    | DCR                               | ścieżka protokołu zaimplementowana |
| Gemini CLI        | ✅          | ✅    | DCR                               | ścieżka protokołu zaimplementowana |
| Cursor            | ✅          | ✅    | DCR lub static OAuth              | ścieżka protokołu zaimplementowana |
| VS Code / Copilot | ✅          | ✅    | DCR                               | ścieżka protokołu zaimplementowana |
| Windsurf          | ✅          | ✅    | OAuth discovery / Bearer fallback | niezweryfikowane end-to-end        |
| MCP Inspector     | ✅          | ✅    | OAuth lub Bearer                  | narzędzie testowe                  |

„Ścieżka protokołu zaimplementowana” oznacza zgodność z aktualnie udokumentowanym zachowaniem dostawcy, a nie ręczną certyfikację każdego buildu klienta.
