---
title: ChatGPT
translationReviewed: 2026-09-12
sourceHash: 9de76e63d024
---

# ChatGPT

JamRelay peut être connecté à ChatGPT comme serveur MCP distant via HTTPS. Pour ChatGPT, utilisez de préférence un **client OAuth confidentiel pré-enregistré** et copiez exactement le callback affiché par ChatGPT.

```dotenv
MCP_OAUTH_CLIENT_ID=chatgpt-jamrelay
MCP_OAUTH_CLIENT_SECRET=<SECRET_ALEATOIRE_FORT>
MCP_OAUTH_REDIRECT_URI=<CALLBACK_EXACT_DE_CHATGPT>
MCP_OAUTH_OWNER_SECRET=<SECRET_PROPRIETAIRE>
```

Le client peut aussi être placé dans `MCP_OAUTH_CLIENTS_PATH`; DCR peut rester activé pour les autres clients.

```text
Server URL: https://mcp.example.com/mcp
Authorization URL: https://mcp.example.com/oauth/authorize
Token URL: https://mcp.example.com/oauth/token
Issuer: https://mcp.example.com
Resource: https://mcp.example.com/mcp
Token endpoint authentication: client_secret_basic
```

N’utilisez pas les identifiants Spotify ici. `MCP_OAUTH_OWNER_SECRET` est saisi uniquement sur la page d’approbation JamRelay. ChatGPT a déjà été vérifié de bout en bout avec le projet.
