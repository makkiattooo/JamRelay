# Security

JamRelay is self-hosted: you are responsible for the host, reverse proxy, secrets, backups, access policy, and updates.

Treat MCP as a control surface for a Spotify account. An attacker with the API key, OAuth credentials, owner secret, or persistent stores may gain account access or control playback/playlists. HTTPS is required remotely.

The application disables Express fingerprinting, sets browser security headers, bounds JSON bodies, validates OAuth state and exact redirects, enforces S256 PKCE, compares secrets safely, stores MCP token digests, encrypts Spotify tokens, and writes token data atomically. These controls do not replace isolation, rate limiting, monitoring, or secret rotation.

## Threat matrix

| Threat                        | Impact                           | Mitigation                                   | Operator action                              |
| ----------------------------- | -------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Exposed `MCP_API_KEY`         | Any exposed tool can be called   | Keep bearer mode private and rotate key      | Revoke key and inspect logs                  |
| Exposed OAuth owner secret    | Unauthorized MCP authorization   | Owner form and rate limit                    | Change secret and invalidate OAuth store     |
| Exposed Spotify client secret | OAuth client impersonation risk  | Server-only environment variable             | Rotate in Spotify Dashboard                  |
| Leaked `/data`                | Session/token compromise         | Private volume and encryption                | Restore from trusted backup, revoke sessions |
| Compromised reverse proxy     | Credential interception          | HTTPS and trusted proxy boundary             | Isolate proxy and rotate credentials         |
| Malicious write prompt        | Playlist/playback mutation       | MCP mutation annotations and client approval | Review client approvals and revoke access    |
| Log disclosure                | Account activity and identifiers | Redaction plus protected retention           | Restrict log access and purge copies         |

## MCP OAuth client registration

When `MCP_OAUTH_DCR_ENABLED=true`, `POST /oauth/register` is intentionally public. That endpoint only creates an OAuth client identity and records its callback URIs; it does **not** grant access to Spotify or MCP tools. JamRelay still requires PKCE and explicit owner approval with `MCP_OAUTH_OWNER_SECRET` before issuing an authorization code.

DCR registrations are rate-limited, bounded, and pruned. Dynamically generated client secrets are stored as digests. If you use `MCP_OAUTH_CLIENTS_PATH`, remember that the static registry can contain plaintext `clientSecret` values and must be protected like `.env`.

JamRelay does not advertise Client ID Metadata Documents (CIMD) in this release. CIMD would require the authorization server to fetch client-controlled HTTPS metadata, which introduces an outbound SSRF/DNS-rebinding surface that should not be added without dedicated protections.

## Incident response

1. Remove public access or stop the service.
2. Preserve a protected copy of relevant logs without posting them publicly.
3. Rotate or revoke the suspected credential at its source.
4. Delete the MCP OAuth store if MCP sessions may be compromised.
5. Revoke Spotify app access and remove the encrypted Spotify store if Spotify access may be compromised.
6. Reauthorize with fresh credentials, restore only trusted `/data`, and verify read-only calls before writes.
7. Document the timeline and affected clients without including secrets.

## What this project does not provide

There is no multi-tenant user database, per-tool authorization policy, built-in WAF, distributed rate limiter, audit log for every Spotify mutation, or automatic secret rotation. Deployers needing those properties should place the service behind appropriate infrastructure or extend it deliberately.

## Production checklist

- Use unique strong keys and keep `/data` private and backed up securely.
- Bind behind HTTPS; set `TRUST_PROXY` only for a trusted proxy.
- Never expose `/data`, `.env`, logs, or owner approval secrets.
- Review Spotify Developer Terms and AI client data handling.
- Revoke the Spotify app or delete `/data/spotify-token.json` to withdraw access.
