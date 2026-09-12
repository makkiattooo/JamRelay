---
title: Gemini CLI
description: Connect TuneLink to Gemini CLI using automatic OAuth discovery and Dynamic Client Registration.
---

# Gemini CLI

Gemini CLI supports remote Streamable HTTP MCP servers and automatic OAuth discovery. With TuneLink, **DCR is the recommended OAuth path**.

## Recommended setup — OAuth discovery + DCR

Server:

```dotenv
MCP_OAUTH_OWNER_SECRET=<STRONG_OWNER_SECRET>
MCP_OAUTH_DCR_ENABLED=true
```

Add TuneLink:

```bash
gemini mcp add --transport http tunelink https://mcp.example.com/mcp
```

Then authenticate:

```text
/mcp auth tunelink
```

Gemini CLI can:

1. receive TuneLink's `401` challenge;
2. discover protected-resource and authorization-server metadata;
3. register itself dynamically;
4. open the browser for owner approval;
5. use a localhost callback on a random port;
6. exchange the PKCE authorization code;
7. store and refresh its tokens.

TuneLink accepts loopback callbacks registered by native clients and returns the RFC 9207 `iss` parameter that Gemini CLI requires.

## Bearer fallback

For debugging, Gemini CLI can also send a static Bearer header:

```dotenv
MCP_AUTH_MODE=bearer
MCP_API_KEY=<STRONG_RANDOM_VALUE>
```

```bash
gemini mcp add --transport http --header "Authorization: Bearer YOUR_MCP_API_KEY" tunelink https://mcp.example.com/mcp
```

OAuth is preferable for normal remote use because it gives the client expiring access tokens and rotating refresh tokens rather than one long-lived shared key.

## Verify

```text
What is currently playing on Spotify?
```

## Official reference

- https://geminicli.com/docs/tools/mcp-server/
