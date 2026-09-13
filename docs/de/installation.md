# Installation und Deployment

Lokal: `npm ci`, `.env` konfigurieren, `npm run dev`. Für Produktion: `npm ci`, `npm run build`, `npm start`. Für Docker: `docker build -t jamrelay .` und `docker compose up -d --build`.

Binde den App-Port an localhost oder ein privates Netzwerk. Persistiere `/data`, verwende einen unprivilegierten Benutzer und beende TLS an Caddy oder nginx. Setze `PUBLIC_BASE_URL=https://mcp.example.com`; `TRUST_PROXY=true` nur hinter einem vertrauenswürdigen Proxy. Cloudflare Tunnel führt von Internet → Cloudflare → `cloudflared` → App.

Der aktuelle Compose-Beispielservice heißt `jamrelay`, verwendet einen Healthcheck, `cap_drop: ALL` und `no-new-privileges`.
