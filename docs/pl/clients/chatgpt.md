---
title: ChatGPT
translationReviewed: 2026-09-12
sourceHash: 3d334093a42f
---

# ChatGPT

JamRelay może działać jako zdalna aplikacja MCP ChatGPT przez publiczny endpoint HTTPS.

Przy tworzeniu własnej aplikacji MCP użyj:

```text
Name: JamRelay
Description: Use your connected music services through JamRelay's self-hosted MCP server.
Server URL: https://mcp.example.com/mcp
Authentication: OAuth
```

Jeśli formularz umożliwia dodanie ikony, wypróbuj kwadratowy plik PNG: [ikona jasna](../../../assets/brand/masters/jamrelay-icon-black-transparent-1024.png) lub [ikona ciemna](../../../assets/brand/masters/jamrelay-icon-white-transparent-1024.png). Obie mają 1024×1024; zastosuj limity rozmiaru i formatu pokazane przez ChatGPT.

ChatGPT łączy się z serwerem ze swojej infrastruktury. Prywatny adres `127.0.0.1` ani LAN nie będzie dostępny. Użyj publicznego HTTPS skonfigurowanego przez `jamrelay connectivity` (może to być tunel lub reverse proxy) i podaj adres serwera zakończony `/mcp`.

## Zalecany tryb

Dla ChatGPT użyj **pre-registered confidential OAuth client**. ChatGPT pokazuje dokładny callback podczas konfiguracji. Skopiuj go bez zmian.

```dotenv
MCP_OAUTH_CLIENT_ID=chatgpt-jamrelay
MCP_OAUTH_CLIENT_SECRET=<MOCNY_LOSOWY_SEKRET>
MCP_OAUTH_REDIRECT_URI=<DOKLADNY_CALLBACK_Z_CHATGPT>
MCP_OAUTH_OWNER_SECRET=<SEKRET_WLASCICIELA>
```

Możesz też umieścić klienta ChatGPT w `MCP_OAUTH_CLIENTS_PATH`. DCR może pozostać włączone dla pozostałych klientów.

## Ustawienia w ChatGPT

Jeśli otworzysz **Advanced OAuth settings**, ustaw endpointy dla tego samego publicznego originu:

```text
Server URL: https://mcp.example.com/mcp
Authentication: OAuth
Authorization URL: https://mcp.example.com/oauth/authorize
Token URL: https://mcp.example.com/oauth/token
Authorization server / issuer: https://mcp.example.com
Resource: https://mcp.example.com/mcp
Token endpoint authentication: client_secret_basic
```

Nie używaj tutaj Spotify Client ID ani Spotify Client Secret. Przy rozpoczęciu logowania JamRelay pokaże stronę owner approval — wpisujesz tam `MCP_OAUTH_OWNER_SECRET`, którego nie przekazujesz ChatGPT.

Client ID i Client Secret są danymi klienta MCP z `MCP_OAUTH_CLIENTS_PATH`; nie są danymi Spotify. Dodaj do rejestru dokładny callback wyświetlony przez ChatGPT. Jeśli automatyczne wykrywanie metadanych OAuth działa, pozostaw opcjonalne ustawienia zaawansowane bez zmian.

Zapisanie OAuth nie autoryzuje właściciela ani konta muzycznego. Dokończ logowanie w przeglądarce, zatwierdź uprawnienia, włącz aplikację i poproś ChatGPT o listę narzędzi JamRelay. Weryfikację rzeczywistego logowania i wykrycia narzędzi uruchom poleceniem `jamrelay connect client chatgpt --verify`.

## Weryfikacja

ChatGPT jest ścieżką zweryfikowaną end-to-end w tym projekcie. Test odczytu: `What is currently playing on Spotify?`; test zapisu: utworzenie prywatnej playlisty testowej.
