---
title: Compatibilité des clients
translationReviewed: 2026-09-12
sourceHash: 3b11ae96ea79
---

# Compatibilité des clients

Cette matrice distingue la compatibilité protocolaire de la vérification manuelle de bout en bout.

| Client            | Chemin OAuth                                     | Recommandation   | Vérification                             |
| ----------------- | ------------------------------------------------ | ---------------- | ---------------------------------------- |
| ChatGPT           | client confidentiel pré-enregistré               | OAuth statique   | vérifié                                  |
| Claude            | DCR ou credentials statiques                     | DCR              | protocole implémenté ; client à retester |
| Gemini CLI        | client public DCR                                | DCR              | protocole implémenté ; client à retester |
| Cursor            | DCR ou credentials statiques                     | DCR/statique     | protocole implémenté ; client à retester |
| VS Code / Copilot | DCR ou Client ID                                 | DCR              | protocole implémenté ; client à retester |
| Windsurf          | OAuth confirmé, contrat callback moins explicite | discovery/Bearer | non vérifié                              |
| MCP Inspector     | DCR/statique/Bearer                              | test             | outil développeur                        |

MCP 2026-07-28 préfère CIMD; TuneLink v1.0.0 conserve DCR pour la compatibilité actuelle.
