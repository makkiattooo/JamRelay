# Dépannage

- **Redirect URI:** Spotify Dashboard, `.env` et URL publique doivent être identiques.
- **`invalid_grant` / `reauthorization_required`:** relancez `/auth/spotify/login`.
- **MCP `401`:** vérifiez clé bearer, métadonnées OAuth, client, callback et PKCE.
- **Lecture:** vérifiez `get_devices`, Premium et l’appareil actif.
- **Docker:** vérifiez logs, droits de `/data`, environnement et healthcheck.
- **Proxy/Cloudflare:** vérifiez HTTPS, hostname, `X-Forwarded-Proto` et `TRUST_PROXY`.
