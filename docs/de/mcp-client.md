---
title: Generischer MCP-Client
translationReviewed: 2026-09-12
sourceHash: e613c495b8aa
---

# Generischer MCP-Client

JamRelay stellt Streamable HTTP unter `/mcp` bereit. Ein Client benötigt HTTP-MCP und einen unterstützten Auth-Pfad.

Bearer: `Authorization: Bearer YOUR_MCP_API_KEY`. Verwende niemals `MCP_OAUTH_OWNER_SECRET`, `SPOTIFY_CLIENT_SECRET` oder `TOKEN_ENCRYPTION_KEY` als Client-Credential.

Ein moderner OAuth-Client kann 401 + Resource Metadata erhalten, Authorization Metadata entdecken, Pre-Registration oder DCR verwenden, S256-PKCE durchführen, Owner Approval öffnen, `code + iss` erhalten und Refresh Tokens rotieren. Hosted Web Clients nutzen typischerweise HTTPS-Callbacks; Native/CLI Loopback-Callbacks.
