---
title: Cursor
description: Connect JamRelay to Cursor using remote MCP over Streamable HTTP with OAuth or Bearer auth.
---

# Cursor

Cursor supports remote Streamable HTTP MCP servers, OAuth, static OAuth credentials, and custom headers.

## Recommended option — OAuth

Cursor can use DCR when the server advertises a registration endpoint, so the minimal remote configuration can be just:

```json
{
  "mcpServers": {
    "jamrelay": {
      "url": "https://mcp.example.com/mcp"
    }
  }
}
```

JamRelay's DCR implementation accepts HTTPS callbacks, loopback HTTP callbacks, and private-use URI schemes for clients that declare `application_type=native`.

Cursor's current documentation lists these static OAuth callbacks:

```text
Web / Cursor Agents:
https://www.cursor.com/agents/mcp/oauth/callback

Desktop:
http://localhost:8787/callback
```

Cursor has also been transitioning native MCP OAuth away from an older `cursor://` callback toward the loopback callback. JamRelay's native-client DCR handling is compatible with both styles when the client registers them.

## Static OAuth alternative

If DCR is unreliable for a specific Cursor release, use Cursor's documented static OAuth configuration:

```json
{
  "mcpServers": {
    "jamrelay": {
      "url": "https://mcp.example.com/mcp",
      "auth": {
        "CLIENT_ID": "${env:JAMRELAY_OAUTH_CLIENT_ID}",
        "CLIENT_SECRET": "${env:JAMRELAY_OAUTH_CLIENT_SECRET}"
      }
    }
  }
}
```

Register the required Cursor callback(s) in `MCP_OAUTH_CLIENTS_PATH`.

## Bearer fallback

```json
{
  "mcpServers": {
    "jamrelay": {
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:JAMRELAY_API_KEY}"
      }
    }
  }
}
```

## Verify

```text
Use JamRelay to tell me what is currently playing on Spotify.
```

## Official reference

- https://cursor.com/docs/mcp
