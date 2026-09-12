---
title: ChatGPT
translationReviewed: 2026-09-12
sourceHash: 0b1728a880f4
---

# ChatGPT

TuneLink puede conectarse a ChatGPT como MCP remoto mediante HTTPS. Para ChatGPT se recomienda un **cliente OAuth confidencial pre-registrado** y copiar exactamente el callback que muestra ChatGPT.

```dotenv
MCP_OAUTH_CLIENT_ID=chatgpt-tunelink
MCP_OAUTH_CLIENT_SECRET=<SECRETO_ALEATORIO_FUERTE>
MCP_OAUTH_REDIRECT_URI=<CALLBACK_EXACTO_DE_CHATGPT>
MCP_OAUTH_OWNER_SECRET=<SECRETO_DEL_PROPIETARIO>
```

También puedes guardar ChatGPT en `MCP_OAUTH_CLIENTS_PATH`; DCR puede seguir activo para otros clientes.

```text
Server URL: https://mcp.example.com/mcp
Authorization URL: https://mcp.example.com/oauth/authorize
Token URL: https://mcp.example.com/oauth/token
Issuer: https://mcp.example.com
Resource: https://mcp.example.com/mcp
Token endpoint authentication: client_secret_basic
```

No uses aquí Spotify Client ID/Secret. `MCP_OAUTH_OWNER_SECRET` solo se introduce en la página de aprobación de TuneLink. ChatGPT ya fue verificado end-to-end con el proyecto.
