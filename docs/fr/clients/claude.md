---
title: Claude
translationReviewed: 2026-09-12
sourceHash: 42c6e7c3d97d
---

# Claude

Claude prend en charge MCP distant avec OAuth. JamRelay fournit DCR et des clients statiques.

```dotenv
MCP_OAUTH_OWNER_SECRET=<SECRET_FORT>
MCP_OAUTH_DCR_ENABLED=true
```

Ajoutez `https://mcp.example.com/mcp`. Anthropic documente le callback hébergé `https://claude.ai/api/mcp/auth_callback`; avec DCR il est enregistré automatiquement.

Claude Code:

```bash
claude mcp add --transport http jamrelay https://mcp.example.com/mcp
```

DCR permet d’enregistrer un callback loopback sans connaître le port à l’avance. Les surfaces Claude hébergées exigent un endpoint HTTPS public. Le chemin protocolaire est implémenté; le build client actuel reste à retester de bout en bout.
