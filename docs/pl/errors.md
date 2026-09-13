# Błędy i kody statusu

`reauthorization_required` oznacza brak lub odrzucenie autoryzacji Spotify. `spotify_feature_removed` i `artist_top_tracks_endpoint_removed` oznaczają usunięty endpoint Spotify. `invalid_json` oznacza nieprawidłowe JSON dla sukcesu. `rate_limited`, `unauthorized`, `forbidden`, `not_found` i `spotify_api_error` zachowują sens statusu Spotify.

Zwykłe endpointy JSON zwracają błędy w stabilnym formacie `{ "error": { "code": "...", "message": "...", "details": null, "request_id": "..." } }`. Każda odpowiedź zawiera `X-Request-ID`; nieoczekiwane błędy ujawniają klientowi wyłącznie `500 INTERNAL_ERROR`, a szczegóły techniczne trafiają do logów. Nieprawidłowe JSON zwraca `400 INVALID_JSON`.

Rate limit zwraca `429 RATE_LIMIT_EXCEEDED` oraz `Retry-After`, gdy można określić czas ponowienia. Retry z exponential backoff i jitterem dotyczy wyłącznie `429`, `502`, `503` i `504` oraz zawsze respektuje `Retry-After`.

Błędy narzędzi MCP mają `isError: true` i zawierają ten sam stabilny kod aplikacyjny. Trwały limit Spotify zwróci `RATE_LIMIT_EXCEEDED`, `details.spotify_status: 429` oraz `details.retry_after`, jeśli Spotify poda tę wartość. Transport MCP może nadal zwrócić HTTP `200`, ponieważ błąd dotyczy wyniku narzędzia.

MCP OAuth zwraca `invalid_grant` dla wygasłych, użytych, niezgodnych lub błędnych kodów/PKCE, `invalid_client` dla złego klienta, `429` dla rate limitu oraz `503`, gdy OAuth nie jest skonfigurowany. Bezpieczne odczyty mogą ponowić 429/5xx; zapisy nie są automatycznie ponawiane.
