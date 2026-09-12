# Rozwiązywanie problemów

- **Invalid redirect URI:** callback musi być identyczny w Spotify Dashboard, `.env` i adresie publicznym.
- **`invalid_grant` / `reauthorization_required`:** uruchom ponownie `/auth/spotify/login`.
- **MCP `401`:** sprawdź bearer key, OAuth metadata, client ID/secret, callback i PKCE verifier.
- **Owner secret:** `MCP_OAUTH_OWNER_SECRET` pozostaje wyłącznie na serwerze.
- **Playback:** sprawdź `get_devices`, Spotify Premium i aktywne urządzenie.
- **Docker:** sprawdź logi, prawa do `/data`, env i healthcheck.
- **Cloudflare/proxy:** sprawdź HTTPS, `X-Forwarded-Proto`, hostname i `TRUST_PROXY`.
