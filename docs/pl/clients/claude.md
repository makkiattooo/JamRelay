---
title: Claude
translationReviewed: 2026-09-12
sourceHash: efd98c1fa4d9
---

# Claude

Claude obsługuje zdalne MCP z OAuth. TuneLink wspiera DCR oraz statyczne dane klienta.

## Claude.ai / Desktop / mobile / Cowork

Najprościej zostawić:

```dotenv
MCP_OAUTH_OWNER_SECRET=<MOCNY_SEKRET>
MCP_OAUTH_DCR_ENABLED=true
```

i dodać `https://mcp.example.com/mcp`. Claude może odkryć metadata i endpoint rejestracji automatycznie. Anthropic dokumentuje callback hosted surfaces `https://claude.ai/api/mcp/auth_callback`; przy DCR jest rejestrowany automatycznie, a przy konfiguracji statycznej musi znaleźć się w `redirectUris`.

## Claude Code

```bash
claude mcp add --transport http tunelink https://mcp.example.com/mcp
```

DCR pozwala Claude Code zarejestrować callback loopback bez przewidywania portu.

Hosted Claude łączy się z endpointem z infrastruktury Anthropic, więc serwer musi być publicznie dostępny przez HTTPS.

Status: protokół jest zaimplementowany; nie oznaczamy bieżącej wersji klienta jako ręcznie zweryfikowanej, dopóki nie przejdzie testu end-to-end.
