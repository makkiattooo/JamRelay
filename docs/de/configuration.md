---
title: Konfiguration
translationReviewed: 2026-09-12
sourceHash: 61ec5392803b
---

> Translation freshness notice: this older translation has not been fully reviewed against the current owner authorization and installation model. Follow the [canonical English configuration](/configuration) and [upgrade guide](/operations) for current, secure instructions.

# Konfiguration

Kopiere `.env.example` nach `.env`. Committe weder `.env` noch Runtime-Token-Stores. Die kanonische Variablentabelle wird aus `.env.example` generiert.

Lokal liegen Stores standardmäßig unter `./data/`; in Docker Production unter `/data/`.

`MCP_AUTH_MODE=bearer` aktiviert `MCP_API_KEY`. `MCP_AUTH_MODE=none` deaktiviert nur den statischen API-Key und macht `/mcp` **nicht** öffentlich. `.env.example` verwendet deshalb standardmäßig `none`.

OAuth benötigt `MCP_OAUTH_OWNER_SECRET`. DCR wird mit `MCP_OAUTH_DCR_ENABLED=true` aktiviert. Statische Clients werden in `MCP_OAUTH_CLIENTS_PATH` definiert.

Secrets erzeugen:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
