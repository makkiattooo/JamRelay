---
title: Cliente MCP genérico
translationReviewed: 2026-09-12
sourceHash: df74c934da3c
---

# Cliente MCP genérico

TuneLink expone Streamable HTTP en `/mcp`. El cliente necesita transporte MCP HTTP y una ruta de autenticación compatible.

Bearer: `Authorization: Bearer YOUR_MCP_API_KEY`. Nunca entregues al cliente `MCP_OAUTH_OWNER_SECRET`, `SPOTIFY_CLIENT_SECRET` ni `TOKEN_ENCRYPTION_KEY`.

Un cliente OAuth moderno puede recibir 401 + resource metadata, descubrir authorization metadata, usar cliente pre-registrado o DCR, ejecutar PKCE S256, obtener `code + iss`, intercambiar el código y rotar refresh tokens. Los clientes web suelen usar callbacks HTTPS; los clientes nativos/CLI usan loopback.
