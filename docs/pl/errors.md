# Błędy i kody statusu

`reauthorization_required` oznacza brak lub odrzucenie autoryzacji Spotify. `spotify_feature_removed` i `artist_top_tracks_endpoint_removed` oznaczają usunięty endpoint Spotify. `invalid_json` oznacza nieprawidłowe JSON dla sukcesu. `rate_limited`, `unauthorized`, `forbidden`, `not_found` i `spotify_api_error` zachowują sens statusu Spotify.

MCP OAuth zwraca `invalid_grant` dla wygasłych, użytych, niezgodnych lub błędnych kodów/PKCE, `invalid_client` dla złego klienta, `429` dla rate limitu oraz `503`, gdy OAuth nie jest skonfigurowany. Bezpieczne odczyty mogą ponowić 429/5xx; zapisy nie są automatycznie ponawiane.
