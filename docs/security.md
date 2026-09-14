## Owner sessions and MCP grants

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
