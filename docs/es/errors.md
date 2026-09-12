# Errores y estados

`reauthorization_required` indica autorización Spotify ausente o rechazada. `spotify_feature_removed` indica un endpoint eliminado. Otros códigos son `invalid_json`, `rate_limited`, `unauthorized`, `forbidden`, `not_found` y `spotify_api_error`.

MCP OAuth usa `invalid_grant` para códigos expirados, reutilizados, incompatibles o PKCE incorrecto, `invalid_client` para credenciales del cliente, `429` para rate limit y `503` si OAuth no está configurado. Las lecturas GET seguras pueden reintentarse; las escrituras no se reintentan automáticamente.
