---
title: Free and low-cost deployment
description: Ways to run TuneLink for free or with a small monthly budget.
---

# Free and low-cost deployment

TuneLink is lightweight. You do not need an expensive server.

## Choose by budget

| Budget           | Recommended setup                             | Best for                                            |
| ---------------- | --------------------------------------------- | --------------------------------------------------- |
| Free             | Existing PC / home server + Cloudflare Tunnel | Most users who already own always-on hardware       |
| Free             | Free-tier cloud VM with persistent disk       | Users who want cloud hosting without a monthly bill |
| Very low         | Small shared-vCPU VPS                         | Simple 24/7 production hosting                      |
| Free for testing | PaaS free tier                                | Short-lived demos and experiments                   |

## Zero-cost setup

Use an existing computer and expose only TuneLink through a secure tunnel:

```text
AI client → HTTPS → Cloudflare Tunnel → TuneLink → Spotify
```

This works behind CGNAT and does not require opening inbound router ports.

## Low-cost VPS

A tiny VPS is already enough for a private TuneLink instance. Look for:

```text
1 shared vCPU
512 MB–1 GB RAM
5+ GB persistent storage
Ubuntu/Debian
Docker support
```

You usually do not need to pay for a larger machine unless the VPS also hosts other services.

Providers commonly used for small self-hosted workloads include Hetzner, OVHcloud, DigitalOcean, Vultr and similar regional providers. Prices change, so the docs intentionally do not hard-code a monthly price.

## Cheap deployment checklist

1. Choose a small VM with persistent disk.
2. Install Docker.
3. Clone TuneLink.
4. Keep `.env` outside version control.
5. Mount persistent `/data` storage.
6. Use Cloudflare Tunnel or an HTTPS reverse proxy.
7. Configure the public Spotify redirect URI.
8. Configure the exact MCP OAuth callback required by your AI client.
9. Verify that tokens survive a restart.

## PaaS warning

A very cheap or free PaaS is only a good permanent fit if it provides persistent storage. The current application stores encrypted authorization state on disk.

If a platform has an ephemeral filesystem, use it only for tests or move token storage to an external persistent store first.

## Domain cost

A custom domain is useful for stable OAuth callbacks, but users who already own a domain can normally create a subdomain at no additional cost.

## What not to buy

For TuneLink alone you generally do not need:

- multiple dedicated CPU cores
- several gigabytes of RAM
- large SSD volumes
- a public IPv4 address if you use Cloudflare Tunnel

Start small and upgrade only if measurements show a real need.
