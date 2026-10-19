# Connectivity and onboarding

JamRelay supplies integration software. You supply the music and developer accounts, application credentials, MCP client, and any domain, hosting, or third-party subscription you choose. The CLI never asks for a provider password or registrar credential.

Run `jamrelay onboard` to resume the guided flow, or `jamrelay connectivity` to choose or verify an access method. `jamrelay connectivity --json` returns the stable machine-readable connectivity state. Setup progress is stored separately from provider credentials.

## Choose an access method

- **Local** uses `127.0.0.1` and is suitable only for an MCP client on the same computer. A hosted assistant cannot reach your localhost.
- **Tailscale Funnel** publishes a stable `*.ts.net` HTTPS address on your own Tailscale account. Install and sign in to Tailscale on the JamRelay host, enable MagicDNS and HTTPS, permit Funnel in the tailnet policy, then run the host-side command shown by the wizard. Funnel is public internet exposure; Tailscale Serve remains private to the tailnet. Follow the current [Funnel requirements](https://tailscale.com/docs/features/tailscale-funnel).
- **ngrok** uses your own ngrok account and agent. The current free plan includes one assigned development domain, three online endpoints, 1 GB transfer and 20,000 HTTP/S requests; HTTP/S traffic shows an interstitial that may interrupt an MCP/OAuth client. Check the current [plan limits](https://ngrok.com/pricing), then verify the client flow.
- **Cloudflare Quick Tunnel** uses `cloudflared tunnel --url http://127.0.0.1:5267` on the host. The random `trycloudflare.com` URL can change and is for temporary tests, not persistent OAuth or production. Cloudflare documents no SLA and no SSE support for Quick Tunnels.
- **Own domain** offers Cloudflare Tunnel, a public VPS with Caddy or Nginx, or an already configured reverse proxy. A Cloudflare published hostname requires Cloudflare to host the DNS zone. Add the domain to Cloudflare, review imported records, and change nameservers at your registrar only to the exact pair Cloudflare assigns. Do not replace unrelated DNS records.
- **Hosting** requires your own persistent host and storage. A domain is optional if you use a supported tunnel or an existing HTTPS origin. Verify the hosting provider's storage and networking before choosing it.
- **Later** saves progress without claiming remote connectivity is ready.

## DNS and HTTPS

The wizard asks for both the DNS provider and registrar because they may be different companies. For a direct VPS, publish an `A` record for its actual public IPv4 address and an `AAAA` record only if the VPS is reachable over IPv6. For Cloudflare Tunnel, a manual `CNAME` target is the actual tunnel UUID followed by `.cfargotunnel.com`; the Cloudflare dashboard can create the record when the published application route is added. A CNAME cannot be placed at a normal DNS zone apex. Never use a guessed IP or tunnel UUID.

For a direct VPS, the wizard prints a Caddyfile or Nginx site using the selected host/Docker network. Caddy normally obtains and renews HTTPS certificates automatically when DNS points to the server and public TCP ports 80 and 443 can reach it. Nginx needs a certificate from Certbot or your existing ACME process. JamRelay will not open firewall ports. Keep the JamRelay listener private behind the proxy and enable `TRUST_PROXY` only for a proxy you control.

When a proxy runs on the host, route it to the published host port (by default `127.0.0.1:5267`). When it runs in the same Docker network, use the JamRelay service name and container port (normally `jamrelay:5267`). A host-side tunnel must run on the host, not inside the JamRelay container.

After configuring the tunnel or proxy, enter its HTTPS origin. JamRelay checks public DNS, HTTPS certificate validation, `/health`, and that `/mcp` requires authentication. A verified origin is saved to `PUBLIC_BASE_URL`; Spotify, SoundCloud, and YouTube callback URLs are printed for the provider developer applications. Update each redirect URI in the provider portal before authorizing an account. Apple Music uses MusicKit tokens instead of these OAuth callbacks. Changing an origin does not revoke saved OAuth credentials, but the old redirect may stop working until the provider application is updated.

If JamRelay is already running, it holds a configuration lock. The connectivity wizard saves the candidate as pending and tells you to stop the server, run `jamrelay connectivity` and choose **Apply saved public origin**, restart, then run the command again and choose **Verify saved endpoint**. In Docker, stop the Compose service, run `docker compose run --rm jamrelay connectivity` to apply the saved origin, start it with `docker compose up -d`, and run the connectivity command again to verify. Do not run host Docker commands inside the application container.

## Recovery

If DNS does not resolve, confirm the authoritative nameservers and query the exact record at a public resolver. For TLS failures, check that A/AAAA records point to reachable addresses, ports and provider firewalls permit the selected ACME method, and the certificate issuer logs show a successful challenge. A stale AAAA record can break TLS even when IPv4 works. If the ISP uses CGNAT or blocks inbound ports, choose a tunnel or a public VPS instead of port forwarding. If a tunnel is offline or its URL changed, restart its host-side process and enter the current origin again. If OAuth returns a redirect mismatch, copy the callback printed by `jamrelay connectivity` exactly into the developer application and retry authorization.

Progress can be resumed with `jamrelay onboard` or `jamrelay connectivity`. The wizard marks installation, server, endpoint protection, account authorization and AI client setup as separate steps; it does not claim a music account or external MCP client is connected until that integration reports success.
