# Security policy

## Supported versions

Only the latest release on the default branch is supported. This project is currently preparing its first public release.

## Reporting a vulnerability

Do not open a public issue containing credentials, tokens, personal data, or exploit details. Use the repository's private security-advisory mechanism once enabled, or contact the repository owner through the private contact channel configured for the public repository.

## Self-hosted responsibilities

Operators must protect `.env`, `/data`, backups, reverse proxy configuration, logs, OAuth secrets, and the host itself. Use HTTPS for remote access, least-privilege filesystem permissions, network restrictions, and current dependencies. See `docs/security.md` for the threat model and production checklist.

## MCP OAuth registration

`POST /oauth/register` is intentionally unauthenticated when Dynamic Client Registration is enabled. Registration creates an OAuth client identity only; it does not grant access to Spotify or MCP tools. An authorization code is issued only after the operator approves the request with `MCP_OAUTH_OWNER_SECRET`.

If `MCP_OAUTH_CLIENTS_PATH` points to a static multi-client registry containing `clientSecret` values, treat that JSON file as a secret. Keep it outside version control, restrict filesystem access, and back it up with the same care as `.env` and the persistent OAuth store.

JamRelay does not advertise Client ID Metadata Documents (CIMD) in this release. Implementing CIMD on the authorization-server side requires fetching client-controlled HTTPS metadata and therefore needs deliberate SSRF and DNS-rebinding protections.
