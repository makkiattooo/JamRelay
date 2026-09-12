---
title: Configuración
translationReviewed: 2026-09-12
sourceHash: 9995ae91d43c
---

# Configuración

Copia `.env.example` a `.env`. No hagas commit de `.env` ni de los token stores. La tabla canónica de variables se genera desde `.env.example`.

Los stores usan `./data/` localmente y `/data/` en Docker production.

`MCP_AUTH_MODE=bearer` activa `MCP_API_KEY`. `MCP_AUTH_MODE=none` solo desactiva la API key estática y **no hace público `/mcp`**. Por eso `.env.example` usa `none` por defecto.

OAuth usa `MCP_OAUTH_OWNER_SECRET`; DCR usa `MCP_OAUTH_DCR_ENABLED=true`. Un ChatGPT legacy/estático necesita las tres variables `MCP_OAUTH_CLIENT_ID`, `MCP_OAUTH_CLIENT_SECRET`, `MCP_OAUTH_REDIRECT_URI`. Varios clientes estáticos usan `MCP_OAUTH_CLIENTS_PATH`.

Generar secreto:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
