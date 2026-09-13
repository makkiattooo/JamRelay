---
title: Kompatybilność klientów
translationReviewed: 2026-09-12
sourceHash: 3b11ae96ea79
---

# Kompatybilność klientów

Ta tabela rozdziela **kompatybilność protokołu** od **ręcznej weryfikacji end-to-end**.

| Klient               | Ścieżka OAuth w JamRelay                                           | Zalecenie        | Weryfikacja                                          |
| -------------------- | ------------------------------------------------------------------ | ---------------- | ---------------------------------------------------- |
| ChatGPT custom MCP   | pre-registered confidential client                                 | static OAuth     | zweryfikowane                                        |
| Claude hosted / Code | DCR lub static credentials                                         | DCR              | protokół zaimplementowany; klient do ponownego testu |
| Gemini CLI           | DCR public client                                                  | DCR              | protokół zaimplementowany; klient do ponownego testu |
| Cursor               | DCR lub static credentials                                         | DCR/static       | protokół zaimplementowany; klient do ponownego testu |
| VS Code / Copilot    | DCR lub Client ID                                                  | DCR              | protokół zaimplementowany; klient do ponownego testu |
| Windsurf             | OAuth potwierdzone przez dostawcę, mniej jawny kontrakt callbacków | discovery/Bearer | niezweryfikowane                                     |
| MCP Inspector        | DCR/static OAuth/Bearer                                            | OAuth/Bearer     | narzędzie developerskie                              |

Jedna instancja nie wymaga już podmieniania jednego globalnego callbacka między klientami.

> [!NOTE]
> MCP 2026-07-28 preferuje CIMD i długoterminowo deprecjonuje DCR. JamRelay v1.0.0 zachowuje DCR dla kompatybilności z klientami wdrożonymi obecnie.
