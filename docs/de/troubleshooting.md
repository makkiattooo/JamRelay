# Fehlerbehebung

- **Redirect-Fehler:** Spotify Dashboard, `.env` und öffentliche URL müssen exakt übereinstimmen.
- **`invalid_grant` / `reauthorization_required`:** erneut `/auth/spotify/login` öffnen.
- **MCP `401`:** Bearer-Key, OAuth-Metadaten, Clientdaten, Callback und PKCE prüfen.
- **Playback:** `get_devices`, Spotify Premium und aktives Gerät prüfen.
- **Docker:** Logs, `/data`-Berechtigungen, Environment und Healthcheck prüfen.
- **Proxy/Cloudflare:** HTTPS, Hostname, `X-Forwarded-Proto` und `TRUST_PROXY` prüfen.
