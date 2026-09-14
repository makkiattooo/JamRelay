---
title: ChatGPT
translationReviewed: 2026-09-12
sourceHash: 9de76e63d024
---

# ChatGPT

JamRelay kann als entfernte MCP-App über einen öffentlichen HTTPS-Endpunkt mit ChatGPT verbunden werden. Für ChatGPT empfiehlt sich ein **vorregistrierter vertraulicher OAuth-Client**. Übernimm die in ChatGPT angezeigte Callback-URL exakt.

```dotenv
MCP_OAUTH_CLIENT_ID=chatgpt-jamrelay
MCP_OAUTH_CLIENT_SECRET=<STARKES_ZUFALLSGEHEIMNIS>
MCP_OAUTH_REDIRECT_URI=<EXAKTER_CHATGPT_CALLBACK>
MCP_OAUTH_OWNER_SECRET=<OWNER_SECRET>
```

Alternativ kann der ChatGPT-Client in `MCP_OAUTH_CLIENTS_PATH` liegen; DCR darf gleichzeitig für andere Clients aktiv bleiben.

```text
Server URL: https://mcp.example.com/mcp
Authentication: OAuth
Authorization URL: https://mcp.example.com/oauth/authorize
Token URL: https://mcp.example.com/oauth/token
Issuer: https://mcp.example.com
Resource: https://mcp.example.com/mcp
Token endpoint authentication: client_secret_basic
```

Spotify Client ID/Secret gehören hier **nicht** hinein. Die Owner-Approval-Seite verwendet `MCP_OAUTH_OWNER_SECRET`, das nicht an ChatGPT weitergegeben wird. ChatGPT wurde mit dem Projekt bereits Ende-zu-Ende getestet.
