---
title: MCP Inspector
description: Test JamRelay discovery, OAuth, Bearer auth, tools, and protocol behavior with MCP Inspector.
---

# MCP Inspector

Use MCP Inspector to validate JamRelay independently of a production AI client.

It is useful for testing:

- OAuth discovery;
- DCR / client registration;
- PKCE;
- Bearer authentication;
- `tools/list`;
- individual tool calls;
- protocol responses.

## Bearer authentication

```bash
npx @modelcontextprotocol/inspector --cli https://mcp.example.com/mcp --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" --method tools/list
```

## OAuth

Run:

```bash
npx @modelcontextprotocol/inspector
```

Choose Streamable HTTP and enter:

```text
https://mcp.example.com/mcp
```

Current Inspector releases support modern MCP OAuth flows, including dynamic/static client information depending on the selected mode. Let Inspector perform discovery first rather than manually hard-coding JamRelay endpoints unless you are debugging discovery itself.

## Recommended release checks

```text
GET /mcp without auth                  -> 401 + resource_metadata
GET protected-resource metadata        -> correct /mcp resource
GET path-suffixed metadata /.../mcp    -> same resource metadata
GET authorization-server metadata      -> correct issuer/endpoints
DCR public native client               -> registration succeeds
unsafe remote HTTP callback            -> registration rejected
PKCE other than S256                    -> rejected
authorization callback                 -> code + state + iss
valid OAuth access token               -> tools/list works
reused authorization code              -> rejected
rotated refresh token                  -> old refresh token rejected
```

Do not paste production secrets into screenshots, bug reports, or public CI logs.

## Official reference

- https://github.com/modelcontextprotocol/inspector
