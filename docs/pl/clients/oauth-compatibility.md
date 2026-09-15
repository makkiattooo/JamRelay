---
title: OAuth i wielu klientów
translationReviewed: 2026-09-12
sourceHash: baee792efd6c
---

# OAuth i wielu klientów

```text
AI / MCP client
   │ MCP OAuth lub Bearer
   ▼
JamRelay
   │ Spotify OAuth
   ▼
Spotify Web API
```

Klient MCP nigdy nie dostaje Spotify client secret, Spotify refresh tokena, klucza szyfrowania ani owner secretu.

## Jedna instancja, wiele klientów

Równocześnie mogą działać: statyczni klienci z `MCP_OAUTH_CLIENTS_PATH`, dynamic clients przez `/oauth/register`, public clients (`none`), confidential clients (`client_secret_basic` / `client_secret_post`) oraz opcjonalny `MCP_API_KEY`.

## Rejestracja MCP

```text
pre-registration  ✅
DCR               ✅
CIMD              jeszcze nie reklamowane
```

MCP 2026-07-28 formalnie przesuwa nowe rejestracje w stronę CIMD. DCR pozostaje dla kompatybilności z istniejącymi klientami. CIMD nie jest reklamowane, dopóki serwer nie ma celowo utwardzonego mechanizmu pobierania zewnętrznych metadata.

## Zachowanie klientów — przegląd 2026-09-12

| Klient        | Zachowanie dostawcy                                                | Najlepsza ścieżka         |
| ------------- | ------------------------------------------------------------------ | ------------------------- |
| ChatGPT       | exact callback + własny Client ID/Secret                           | static pre-registration   |
| Claude        | DCR + opcjonalne static credentials                                | DCR/static                |
| Gemini CLI    | auto discovery + DCR + losowy localhost callback + RFC 9207 `iss`  | DCR public client         |
| Cursor        | OAuth, static credentials, web/Agents callback i localhost desktop | DCR/static                |
| VS Code       | najpierw DCR, fallback do Client ID; localhost + `vscode.dev`      | DCR                       |
| Windsurf      | OAuth dla MCP, mniej jawny kontrakt rejestracji                    | discovery/Bearer fallback |
| MCP Inspector | debugging OAuth/Bearer                                             | dowolna ścieżka testowa   |

## Flow DCR

```text
1. /mcp -> 401 + resource_metadata
2. protected-resource metadata
3. authorization-server metadata
4. POST /oauth/register
5. /oauth/authorize + PKCE S256
6. owner approval
7. callback: code + state + iss
8. POST /oauth/token
9. /mcp z access tokenem
10. refresh token rotation
```

Samo DCR nie daje dostępu do Spotify.

## Static registry

Zacznij od `examples/mcp-oauth-clients.example.json`. Registry jest dobre dla callbacków znanych z góry i może współistnieć z DCR.

## Granica weryfikacji

ChatGPT został zweryfikowany end-to-end. Pozostałe wpisy oznaczają zaimplementowaną ścieżkę zgodną z aktualną dokumentacją dostawcy, dopóki konkretny build klienta nie zostanie osobno przetestowany.
