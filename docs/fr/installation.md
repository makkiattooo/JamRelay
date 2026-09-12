# Installation et déploiement

En local: `npm ci`, configuration de `.env`, puis `npm run dev`. En production Node: `npm ci`, `npm run build`, `npm start`. Avec Docker: `docker build -t tunelink .` puis `docker compose up -d --build`.

Conservez le port de l’application sur localhost ou un réseau privé, persistez `/data`, utilisez un utilisateur non privilégié et terminez TLS avec Caddy/nginx. Utilisez `PUBLIC_BASE_URL=https://mcp.example.com` et activez `TRUST_PROXY=true` uniquement derrière un proxy de confiance. Cloudflare Tunnel suit Internet → Cloudflare → `cloudflared` → application.
