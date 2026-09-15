## Owner sessions and MCP grants

Credential-store mutations are serialized by canonical file path, including
across multiple in-process store instances. The encrypted file store remains a
single-process/single-writer design; use one JamRelay writer per credential
path unless deployment-level file locking is added.

The owner secret is a bootstrap credential. `/owner/login` exchanges it for a
short-lived HttpOnly session cookie; production cookies are Secure and use
SameSite=Lax. Owner mutations require the session's CSRF token. Sessions can be
rotated at `POST /owner/session/rotate` and invalidated at `POST /owner/logout`.

MCP OAuth consent records an allow-list of connection IDs and granular
permissions. The server checks both on every tool invocation and returns
`PERMISSION_NOT_GRANTED` or `CONNECTION_NOT_GRANTED` with HTTP/MCP status 403.
Provider adapters still enforce capability availability and return
`CAPABILITY_UNAVAILABLE` when an operation is not supported.

The additive OAuth-store migration keeps records created before ACLs usable as
Tokens without a current grant are rejected and must be authorized again.
Every consented grant contains an explicit connection and permission allow-list;
owners can replace or revoke it from the Connection Hub. Revocation is checked
against each request and invalidates the grant immediately.

## Three separate trust boundaries

1. **MCP authentication** protects `/mcp` with bearer API keys or MCP OAuth.
2. **Owner authentication** protects the Connection Hub with the owner secret,
   an owner session cookie, and CSRF checks for mutations.
3. **Provider authentication** is the independent OAuth/token model of Spotify,
   SoundCloud, YouTube, or Apple Music.

An MCP grant can restrict both permissions and allowed connection IDs. Writes
and destructive operations fail closed when a target is missing, revoked,
ambiguous, or lacks the capability. Provider status is never treated as a
server-health credential.

Tool authorization, read-only/destructive MCP annotations and execution
budgets come from one declarative tool-security manifest. Registration fails
closed when a tool has no manifest entry. Generic MCP and playlist services use
the provider transport contract rather than depending on `SpotifyClient`.
