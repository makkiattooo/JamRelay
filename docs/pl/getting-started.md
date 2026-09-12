# Szybki start

Wymagany jest Node.js 22+ albo Docker oraz aplikacja Spotify Developer. Skopiuj `.env.example` do `.env`, uzupełnij dane Spotify, wygeneruj 32-bajtowy `TOKEN_ENCRYPTION_KEY`, a następnie uruchom:

```bash
npm ci
npm run dev
```

Otwórz `/auth/spotify/login`, zaakceptuj dostęp i skonfiguruj klienta MCP z adresem `/mcp`. Przed wystawieniem usługi do internetu przeczytaj strony [instalacji](/installation), [OAuth](/oauth) i [bezpieczeństwa](/security).
