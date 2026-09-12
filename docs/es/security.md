# Seguridad

TuneLink es autoalojado. El operador protege el host, HTTPS, proxy, secretos, copias, logs y actualizaciones. `/data` y `.env` nunca deben ser públicos.

La implementación usa state, redirect URI exacta, S256 PKCE, comparación segura, tokens MCP con hash, tokens Spotify cifrados, escrituras atómicas, timeouts y redacción de logs. No proporciona multi-tenancy, WAF ni auditoría completa de mutaciones.
