---
title: Provider connections
---

# Provider Connection Hub

The owner Connection Hub is provider-neutral. A deployment can hold several
connections for the same provider and can independently choose preferred read
and write connections. Read routing may fall back only among permitted,
capable connections. Writes remain fail-closed when the target is missing or
ambiguous.

The Hub is the onboarding and administration surface, not the MCP client
authentication layer. Owner login/session and CSRF protection guard its
mutations; MCP OAuth/API-key authentication and grants guard `/mcp` separately.

The JSON owner API is available after signing in at `/owner/login`:

- `GET /connections` lists connection summaries and preferred targets;
- `GET /connections/:connectionId` inspects one connection;
- `PATCH /connections/:connectionId` renames a connection or sets
  `preferred_read` / `preferred_write`;
- `DELETE /connections/:connectionId` disconnects the runtime connection while
  retaining local state and history;
- `GET/PATCH/DELETE /owner/grants/:clientId` inspects, changes, or revokes an
  MCP client grant.

Mutating owner requests require the `x-csrf-token` value issued by the owner
session. Provider credentials are managed by their provider-specific OAuth
flow; they are never returned by this API.
