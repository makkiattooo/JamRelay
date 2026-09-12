# Solución de problemas

- **Redirect URI:** Spotify Dashboard, `.env` y URL pública deben coincidir exactamente.
- **`invalid_grant` / `reauthorization_required`:** vuelve a abrir `/auth/spotify/login`.
- **MCP `401`:** revisa bearer key, metadata OAuth, cliente, callback y PKCE.
- **Reproducción:** revisa `get_devices`, Spotify Premium y el dispositivo activo.
- **Docker:** revisa logs, permisos de `/data`, entorno y healthcheck.
- **Proxy/Cloudflare:** revisa HTTPS, hostname, `X-Forwarded-Proto` y `TRUST_PROXY`.
