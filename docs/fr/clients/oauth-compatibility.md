---
title: OAuth et plusieurs clients
translationReviewed: 2026-09-12
sourceHash: 3409130e2dab
---

# OAuth et plusieurs clients

Le client MCP ne reçoit jamais le Spotify Client Secret, le refresh token Spotify, la clé de chiffrement ni le secret propriétaire.

Une instance peut utiliser plusieurs clients statiques via `MCP_OAUTH_CLIENTS_PATH`, DCR, clients publics, clients confidentiels et éventuellement `MCP_API_KEY`.

```text
pre-registration  ✅
DCR               ✅
CIMD              pas encore annoncé
```

| Client     | Comportement documenté                              | Meilleur chemin             |
| ---------- | --------------------------------------------------- | --------------------------- |
| ChatGPT    | callback exact + Client ID/Secret                   | pré-enregistrement statique |
| Claude     | DCR + credentials statiques optionnels              | DCR/statique                |
| Gemini CLI | discovery + DCR + localhost aléatoire + `iss`       | client public DCR           |
| Cursor     | OAuth, credentials statiques, callbacks web/desktop | DCR/statique                |
| VS Code    | DCR d’abord, fallback Client ID                     | DCR                         |
| Windsurf   | OAuth confirmé, enregistrement moins explicite      | discovery/Bearer            |
| Inspector  | debug OAuth/Bearer                                  | test                        |

Flux : 401 → resource metadata → authorization metadata → `/oauth/register` → `/oauth/authorize` S256 → approbation → callback `code + state + iss` → `/oauth/token` → `/mcp`. DCR seul n’accorde aucun accès Spotify.

ChatGPT a été vérifié de bout en bout; les autres lignes décrivent les chemins protocolaires alignés sur la documentation actuelle des fournisseurs.
