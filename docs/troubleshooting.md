# Troubleshooting

## No providers connected

This is valid. JamRelay can boot with an empty provider registry and `/health`
can still be `status: ok` when the database is ready. Connect a provider through
the [Connection Hub](/provider-connections) before calling provider-scoped tools.

## Write target errors

Supply the intended `connection_id` and confirm the connection declares the
required capability. Multiple possible write targets are rejected deliberately;
JamRelay never silently switches provider or account.

- **Spotify authorization failure:** callback must exactly match the dashboard and `SPOTIFY_REDIRECT_URI`.
- **`reauthorization_required` / `invalid_grant`:** authorize again at `/auth/providers/spotify/start`.
- **MCP 401:** check bearer/OAuth token, `.well-known` metadata, `PUBLIC_BASE_URL`, client ID, secret, callback, and PKCE verifier.
- **Owner approval denied:** `MCP_OAUTH_OWNER_SECRET` is server-only and exact.
- **Playback errors:** check Premium, an active device, and `get_devices`.
- **Proxy errors:** verify HTTPS, `X-Forwarded-Proto`, hostname, callback reachability, and `TRUST_PROXY`.
- **Docker errors:** inspect logs, `/data` permissions, and loaded environment variables.
- **Rate limits:** reads honor bounded retries and `Retry-After`; writes are not automatically retried.
