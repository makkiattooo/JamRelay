---
title: Konfiguration
translationReviewed: 2026-09-12
sourceHash: 9995ae91d43c
---

# Konfiguration

Kopiere `.env.example` nach `.env`. Committe weder `.env` noch Runtime-Token-Stores. Die kanonische Variablentabelle wird aus `.env.example` generiert.

Lokal liegen Stores standardmäßig unter `./data/`; in Docker Production unter `/data/`.

`MCP_AUTH_MODE=bearer` aktiviert `MCP_API_KEY`. `MCP_AUTH_MODE=none` deaktiviert nur den statischen API-Key und macht `/mcp` **nicht** öffentlich. `.env.example` verwendet deshalb standardmäßig `none`.

OAuth benötigt `MCP_OAUTH_OWNER_SECRET`. DCR wird mit `MCP_OAUTH_DCR_ENABLED=true` aktiviert. Ein Legacy/Static-ChatGPT-Client benötigt `MCP_OAUTH_CLIENT_ID`, `MCP_OAUTH_CLIENT_SECRET` und `MCP_OAUTH_REDIRECT_URI` vollständig. Mehrere statische Clients kommen in `MCP_OAUTH_CLIENTS_PATH`.

Secrets erzeugen:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
