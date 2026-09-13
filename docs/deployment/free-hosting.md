---
title: Free hosting options
description: Run JamRelay without a paid VPS.
---

# Free hosting options

You do **not** need a paid VPS to run JamRelay.

The simplest free path is usually:

```text
Your PC / home server
        ↓
     JamRelay
        ↓
 Cloudflare Tunnel
        ↓
https://mcp.example.com/mcp
```

Cloudflare Tunnel uses an outbound connection, so you do not need a public IPv4 address or router port forwarding.

## Local computer + Cloudflare Tunnel

This keeps the current file-based token stores and requires almost no architecture changes.

### Requirements

- Node.js 22+ or Docker
- a computer that can stay online while you use JamRelay
- a stable HTTPS hostname for remote OAuth clients
- your own Spotify Developer application

Start locally:

```bash
npm ci
npm run build
npm start
```

or:

```bash
docker compose up -d
```

Point a Cloudflare Tunnel hostname such as `mcp.example.com` at the local service, normally `http://127.0.0.1:5267`.

### Good fit

- existing laptop or desktop
- mini-PC
- Raspberry Pi
- NAS / home server
- users behind CGNAT

### Trade-offs

The computer must stay powered on and your home internet becomes part of the service availability.

## Free-tier cloud VM

A free-tier VM can behave almost exactly like a small VPS:

```text
Cloud VM
├── Docker
│   └── JamRelay
└── cloudflared / reverse proxy
```

Choose a provider that offers **persistent disk storage**. JamRelay stores encrypted Spotify tokens and MCP OAuth state on disk, so ephemeral-only hosting is a poor permanent fit.

Free VM capacity and provider rules change frequently. Treat a free tier as a convenience rather than a permanent guarantee.

## Free PaaS

Some free application platforms sleep or scale to zero and use ephemeral filesystems.

That is fine for experiments, but the current JamRelay storage model expects persistent files such as:

```text
./data/spotify-token.json
./data/mcp-oauth.json
```

If the filesystem disappears, you may need to authorize again.

A PaaS becomes a much better permanent option after moving token storage to an external persistent database or key-value store.

## Recommendation

For a first-time user without a VPS:

```text
1. Run JamRelay locally
2. Complete Spotify OAuth
3. Test MCP locally
4. Add a stable Cloudflare Tunnel hostname
5. Connect the AI client
```

Move to a VPS only when you actually need independent 24/7 availability.

## Security

Free hosting should use the same security rules as paid hosting:

- keep `/mcp` authenticated
- never commit `.env`
- use HTTPS for remote access
- use strong random secrets
- keep `/data` private and persistent
- keep the host and dependencies updated

## Provider documentation

Provider offers change. Check current terms before relying on them:

- Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/
- Oracle Cloud Free Tier: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- Render Free: https://render.com/docs/free
- Koyeb instances: https://www.koyeb.com/docs/reference/instances
