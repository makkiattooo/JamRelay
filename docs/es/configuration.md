---
title: Configuración
translationReviewed: 2026-09-12
sourceHash: c33366e9f0bd
---

# Configuración

Copia `.env.example` a `.env`. No hagas commit de `.env` ni de los token stores. La tabla canónica de variables se genera desde `.env.example`.

Los stores usan `./data/` localmente y `/data/` en Docker production.

`MCP_AUTH_MODE=bearer` activa `MCP_API_KEY`. `MCP_AUTH_MODE=none` solo desactiva la API key estática y **no hace público `/mcp`**. Por eso `.env.example` usa `none` por defecto.

OAuth usa `MCP_OAUTH_OWNER_SECRET`; DCR usa `MCP_OAUTH_DCR_ENABLED=true`. Los clientes estáticos se definen en `MCP_OAUTH_CLIENTS_PATH`.

Generar secreto:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
