# Troubleshooting

- **Spotify authorization failure:** callback must exactly match the dashboard and `SPOTIFY_REDIRECT_URI`.
- **`reauthorization_required` / `invalid_grant`:** authorize again at `/auth/spotify/login`.
- **MCP 401:** check bearer/OAuth token, `.well-known` metadata, `PUBLIC_BASE_URL`, client ID, secret, callback, and PKCE verifier.
- **Owner approval denied:** `MCP_OAUTH_OWNER_SECRET` is server-only and exact.
- **Playback errors:** check Premium, an active device, and `get_devices`.
- **Proxy errors:** verify HTTPS, `X-Forwarded-Proto`, hostname, callback reachability, and `TRUST_PROXY`.
- **Docker errors:** inspect logs, `/data` permissions, and loaded environment variables.
- **Rate limits:** reads honor bounded retries and `Retry-After`; writes are not automatically retried.
