# Instalacja i wdrożenie

## Lokalny development

```bash
npm ci
cp .env.example .env
npm run dev
```

Użyj `http://127.0.0.1:3010` w `PUBLIC_BASE_URL` i zarejestruj identyczny `SPOTIFY_REDIRECT_URI`.

## Lokalna produkcja

```bash
npm ci
npm run build
npm start
```

## Docker i Compose

```bash
docker build -t tunelink .
docker run --env-file .env -p 127.0.0.1:3000:3000 -v tunelink-data:/data tunelink
docker compose up -d --build
```

Obraz działa jako użytkownik nieuprzywilejowany, a `/data` musi być trwałym prywatnym wolumenem. Przykład Compose ogranicza port do localhost, zrzuca capabilities i włącza `no-new-privileges`.

## VPS, serwer domowy i NAS

Na Ubuntu/Debian lub NAS użyj Node.js 22+ albo Dockera. Ogranicz port aplikacji do localhost/prywatnej sieci, zakończ HTTPS w reverse proxy i zachowaj `/data`. Ogólny szkic usługi systemd znajduje się w [wersji angielskiej](/installation); użytkownik usługi powinien mieć dostęp wyłącznie do aplikacji i `/data`.

## Reverse proxy i Cloudflare Tunnel

Użyj domeny `mcp.example.com`, ustaw `PUBLIC_BASE_URL=https://mcp.example.com` i `TRUST_PROXY=true` tylko za zaufanym proxy. Przepływ tunelu: Internet → Cloudflare → `cloudflared` → aplikacja MCP. Tokeny Cloudflare przechowuj poza repozytorium.
