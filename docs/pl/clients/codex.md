---
title: Codex CLI i Desktop
description: Połącz Codex z lokalnym lub publicznym serwerem MCP JamRelay.
---

# Codex CLI i Desktop

Codex CLI i aplikacja Codex Desktop korzystają z tej samej konfiguracji MCP użytkownika. Na hoście Windows zarejestruj JamRelay przy użyciu adresu dostępnego z hosta (w tym portu opublikowanego przez Docker):

```powershell
codex mcp add jamrelay --url http://127.0.0.1:5267/mcp
codex mcp list
```

Zastąp `5267` skonfigurowanym portem hosta. Jeśli Codex CLI nie jest zainstalowany, dodaj wpis do `%USERPROFILE%\.codex\config.toml`:

```toml
[mcp_servers.jamrelay]
url = "http://127.0.0.1:5267/mcp"
```

Uruchom ponownie lub odśwież Codex, włącz JamRelay i dokończ OAuth, gdy klient o to poprosi. `codex mcp list` potwierdza wyłącznie rejestrację. Po autoryzacji poproś Codex o listę narzędzi JamRelay, a następnie uruchom `jamrelay connect client codex --verify`, aby sprawdzić autoryzację i wykrycie narzędzi po stronie serwera. Konta usług muzycznych, np. Spotify, wymagają osobnej autoryzacji.

Zdalny serwer JamRelay musi używać publicznego adresu HTTPS zakończonego `/mcp`. Klient działający w chmurze nie ma dostępu do prywatnego `127.0.0.1` na Twoim komputerze. Nie umieszczaj w konfiguracji Codex hasła właściciela JamRelay, danych Spotify, sekretu odzyskiwania ani klucza szyfrowania.

Oficjalne instrukcje: [serwery MCP w Codex](https://developers.openai.com/codex/mcp).
