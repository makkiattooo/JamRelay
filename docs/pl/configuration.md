---
title: Konfiguracja
translationReviewed: 2026-10-19
sourceHash: 622a2cfce905
---

# Konfiguracja

To aktualne polskie streszczenie. Pełny opis ustawień, przykładów i ograniczeń
jest w [kanonicznej konfiguracji](/configuration), a tabela zmiennych jest
[generowana z `.env.example`](/environment-reference).

- Nową instalację konfiguruje `jamrelay setup`; istniejącą — `jamrelay config`.
  Dla checkoutu developerskiego można nadal używać `.env`.
- Katalogi zarządzanej instalacji są zależne od platformy; starsze wdrożenia
  `.env` zachowują ścieżki. Docker przechowuje konfigurację i dane w `/data`.
  Jawne ścieżki mają pierwszeństwo. Zobacz [instalację](/installation).
- Poświadczenia dostawców trafiają do `provider-credentials.json`, osobno od
  `mcp-oauth.json` i statycznego rejestru `mcp-oauth-clients.json`.
  Nie commituj prywatnej konfiguracji ani magazynów tokenów.
- `TOKEN_ENCRYPTION_KEY` koduje w base64 dokładnie 32 bajty. Właściciel używa
  osobnego `MCP_OAUTH_OWNER_SECRET`. Kreator zachowuje istniejący klucz;
  jego utrata uniemożliwia odczyt zaszyfrowanych danych.
- Konfiguracja dostawców jest opcjonalna. Uzupełnij cały zestaw wymaganych pól
  wybranego dostawcy albo pozostaw cały zestaw pusty. Apple Music wymaga
  klucza Media Services i osobnego Music User Token; YouTube korzysta z
  oficjalnego Data API, nie z API biblioteki YouTube Music.
- `PUBLIC_BASE_URL` wskazuje rzeczywisty adres serwera. Zdalny dostęp wymaga
  HTTPS. `TRUST_PROXY` ustaw tylko zgodnie z faktycznie zaufanym proxy.
- `MCP_AUTH_MODE=none` wyłącza wyłącznie statyczny klucz API; nie otwiera
  chronionego endpointu `/mcp`. `bearer` dodaje uwierzytelnianie `MCP_API_KEY`.
- `MCP_OAUTH_DCR_ENABLED` kontroluje rejestrację klientów, a
  `MCP_OAUTH_CLIENTS_PATH` wskazuje statyczny rejestr. Przykładem jest
  `examples/mcp-oauth-clients.example.json`; rejestracja nie zastępuje zgody właściciela.

Opis zgody właściciela i dwóch niezależnych warstw autoryzacji znajduje się na
stronie [OAuth](/pl/oauth). Parametry dostawców i ich ograniczenia opisują
[przewodniki dostawców](/providers/). Operacje lokalne, w tym kopie zapasowe,
są dostępne przez [CLI operatora](/operations), bez panelu administracyjnego WWW.
