---
title: Configuration
translationReviewed: 2026-09-12
sourceHash: c33366e9f0bd
---

# Configuration

Copiez `.env.example` vers `.env`. Ne commitez jamais `.env` ni les token stores. La table canonique des variables est générée depuis `.env.example`.

Les stores utilisent `./data/` en local et `/data/` dans Docker production.

`MCP_AUTH_MODE=bearer` active `MCP_API_KEY`. `MCP_AUTH_MODE=none` désactive seulement la clé API statique et **ne rend pas `/mcp` public**. `.env.example` utilise donc `none` par défaut.

OAuth utilise `MCP_OAUTH_OWNER_SECRET`; DCR utilise `MCP_OAUTH_DCR_ENABLED=true`. Les clients statiques sont définis dans `MCP_OAUTH_CLIENTS_PATH`.

Générer un secret :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
