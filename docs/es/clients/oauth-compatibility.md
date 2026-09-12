---
title: OAuth y varios clientes
translationReviewed: 2026-09-12
sourceHash: 26dfccbf5620
---

# OAuth y varios clientes

El cliente MCP nunca recibe Spotify Client Secret, refresh token de Spotify, clave de cifrado ni owner secret.

Una instancia puede usar a la vez legacy pre-registration, múltiples clientes estáticos mediante `MCP_OAUTH_CLIENTS_PATH`, DCR, clientes públicos, clientes confidenciales y opcionalmente `MCP_API_KEY`.

```text
pre-registration  ✅
DCR               ✅
CIMD              aún no anunciado
```

| Cliente    | Comportamiento documentado                           | Mejor ruta            |
| ---------- | ---------------------------------------------------- | --------------------- |
| ChatGPT    | callback exacto + Client ID/Secret                   | pre-registro estático |
| Claude     | DCR + credenciales estáticas opcionales              | DCR/estático          |
| Gemini CLI | discovery + DCR + localhost aleatorio + `iss`        | cliente público DCR   |
| Cursor     | OAuth, credenciales estáticas, callbacks web/desktop | DCR/estático          |
| VS Code    | DCR primero, fallback Client ID                      | DCR                   |
| Windsurf   | OAuth confirmado, registro menos explícito           | discovery/Bearer      |
| Inspector  | debug OAuth/Bearer                                   | test                  |

Flujo: 401 → resource metadata → authorization metadata → `/oauth/register` → `/oauth/authorize` S256 → aprobación → callback `code + state + iss` → `/oauth/token` → `/mcp`. DCR por sí solo no concede acceso a Spotify.

ChatGPT fue verificado end-to-end; las demás filas describen rutas de protocolo alineadas con la documentación actual del proveedor.
