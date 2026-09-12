# Bezpieczeństwo

TuneLink jest self-hosted. Operator odpowiada za host, HTTPS, reverse proxy, sekrety, backupy, logi i aktualizacje. MCP należy traktować jako panel sterowania kontem Spotify.

Najważniejsze zasady: silne osobne sekrety, prywatny `/data`, port aplikacji tylko lokalnie/prywatnie, `TRUST_PROXY=true` wyłącznie za zaufanym proxy, brak sekretów w issue/logach oraz potwierdzanie operacji zapisu w kliencie.

Implementacja szyfruje tokeny Spotify, przechowuje digesty tokenów MCP, wymaga S256 PKCE, sprawdza exact redirect URI, ma limity OAuth, timeouty i bezpieczne logowanie. Nie zapewnia multi-tenancy, WAF ani pełnego audytu każdej mutacji.
