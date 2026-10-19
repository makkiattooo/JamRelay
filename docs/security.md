# Security boundaries

Provider OAuth, owner sessions and MCP OAuth are separate trust boundaries. Provider tokens stay in the encrypted AES-256-GCM credential store; MCP token digests, clients and grants remain in their existing store. SQLite holds job authorization context and progress, never provider credentials. Keep one credential-store writer process per installation.

## Provider authorization

An anonymous GET cannot initiate a provider flow. Sign in at `/owner/login` with `MCP_OAUTH_OWNER_SECRET` and its login CSRF nonce, then open a provider start URL. The GET only displays consent. An owner-session/CSRF protected POST approves the specific provider and default connection, explicitly including replacement. A separate one-use initiation record binds OAuth state to that session, provider and connection. It expires after ten minutes and is consumed before exchanging a code. The provider's own state verification and existing PKCE checks still apply.

Unapproved, wrong-session, cross-provider, expired and replayed callbacks fail generically without overwriting credentials. A failed token exchange retains old credentials. Initial authorization never borrows another account's refresh token. Apple Music retains the explicit owner-secret-header token endpoint; static MCP API keys cannot configure provider tokens.

Owner login is limited to ten attempts per five minutes per trusted client IP. Secrets are compared as fixed-size hashes with a timing-safe primitive. Session cookies are HttpOnly, SameSite=Lax, Path=/, Secure on HTTPS/production, and expire after thirty minutes. Logout is CSRF protected and revokes the session. Restart invalidates browser sessions and pending initiations. Use HTTPS and configure proxy trust correctly; do not log request bodies, cookies, owner headers or provider callback query strings at the reverse proxy.

## MCP authorization

MCP OAuth retains DCR, exact redirect validation, S256 PKCE, authorization codes, refresh rotation and explicit owner consent. Consent chooses connection IDs and granular permissions. Each tool is checked against the security manifest and current grant. The local operator can revoke a client immediately through SQLite; renewed owner consent is needed to regrant. The static bearer key is privileged operator access and must not be handed to unrelated clients.

Queued jobs persist the creating client and original connection. Job inspection, mutation and list queries enforce both ownership and granted connections. Legacy unowned jobs are operator-only. Unknown executors fail closed; missing connections or unsupported capabilities never fall back to another provider. External write reservation, cancellation and uncertain outcomes are documented in [operations](/operations).

## Operator boundary

There is no HTTP administration interface. The CLI requires local operating-system access and never emits credential content, encryption keys or raw OAuth client records. It is not exposed as an MCP tool. Protect local files, backups and the service account. Detailed diagnostics are for the operator or explicitly granted clients. Public health is limited to readiness/version and non-personal schema readiness.
