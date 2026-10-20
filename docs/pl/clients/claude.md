---
title: Claude
translationReviewed: 2026-09-12
sourceHash: 42c6e7c3d97d
---

# Claude

Gotowa paczka instrukcji dla Claude znajduje się w [`marketplace/jamrelay-claude-plugin-1.5.9.zip`](../../../marketplace/jamrelay-claude-plugin-1.5.9.zip). Zawiera manifest `.claude-plugin/plugin.json`, skill łączenia z JamRelay i ręczne instrukcje konfiguracji MCP. Nie instaluje ani nie hostuje serwera, nie tworzy tunelu i nie zawiera danych logowania. Wgrywanie paczki do Claude jest osobną czynnością; nic nie jest wysyłane automatycznie.

Claude obsługuje zdalne MCP z OAuth. JamRelay wspiera DCR oraz statyczne dane klienta.

## Claude.ai / Desktop / mobile / Cowork

Najprościej zostawić:

```dotenv
MCP_OAUTH_OWNER_SECRET=<MOCNY_SEKRET>
MCP_OAUTH_DCR_ENABLED=true
```

i dodać `https://mcp.example.com/mcp`. Claude może odkryć metadata i endpoint rejestracji automatycznie. Anthropic dokumentuje callback hosted surfaces `https://claude.ai/api/mcp/auth_callback`; przy DCR jest rejestrowany automatycznie, a przy konfiguracji statycznej musi znaleźć się w `redirectUris`.

## Claude Code

```bash
claude mcp add --transport http jamrelay https://mcp.example.com/mcp
```

DCR pozwala Claude Code zarejestrować callback loopback bez przewidywania portu.

Hosted Claude łączy się z endpointem z infrastruktury Anthropic, więc serwer musi być publicznie dostępny przez HTTPS.

Status: protokół jest zaimplementowany; nie oznaczamy bieżącej wersji klienta jako ręcznie zweryfikowanej, dopóki nie przejdzie testu end-to-end.
