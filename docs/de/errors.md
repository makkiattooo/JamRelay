# Fehler und Statuscodes

`reauthorization_required` bedeutet fehlende oder widerrufene Spotify-Autorisierung. `spotify_feature_removed` bezeichnet einen entfernten Provider-Endpunkt. Weitere Codes sind `invalid_json`, `rate_limited`, `unauthorized`, `forbidden`, `not_found` und `spotify_api_error`.

MCP OAuth verwendet `invalid_grant` für abgelaufene, wiederverwendete oder PKCE-falsche Codes, `invalid_client` für falsche Clientdaten, `429` für Rate Limits und `503`, wenn OAuth nicht konfiguriert ist. Sichere GETs werden begrenzt wiederholt; Schreibvorgänge nicht.
