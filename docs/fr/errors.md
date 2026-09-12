# Erreurs et statuts

`reauthorization_required` indique une autorisation Spotify absente ou refusée. `spotify_feature_removed` indique un endpoint supprimé. Les autres codes incluent `invalid_json`, `rate_limited`, `unauthorized`, `forbidden`, `not_found` et `spotify_api_error`.

MCP OAuth utilise `invalid_grant` pour les codes expirés, réutilisés, incompatibles ou un PKCE incorrect, `invalid_client` pour les credentials client, `429` pour la limite de débit et `503` si OAuth n’est pas configuré. Les GET sûrs peuvent être réessayés; les écritures ne le sont pas automatiquement.
