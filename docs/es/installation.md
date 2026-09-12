# Instalación y despliegue

En local: `npm ci`, configura `.env` y ejecuta `npm run dev`. En producción Node: `npm ci`, `npm run build`, `npm start`. Con Docker: `docker build -t tunelink .` y `docker compose up -d --build`.

Mantén el puerto en localhost o una red privada, persiste `/data`, usa un usuario sin privilegios y termina TLS en Caddy/nginx. Configura `PUBLIC_BASE_URL=https://mcp.example.com` y usa `TRUST_PROXY=true` solo detrás de un proxy de confianza. Cloudflare Tunnel sigue Internet → Cloudflare → `cloudflared` → aplicación.
