---
title: Windsurf
description: Connect JamRelay to Windsurf Cascade using remote MCP.
---

# Windsurf Cascade

Windsurf Cascade supports `stdio`, Streamable HTTP, SSE, and OAuth for MCP connections.

## OAuth

Add the remote endpoint:

```text
https://mcp.example.com/mcp
```

JamRelay publishes standards-based OAuth discovery plus DCR. Windsurf's public MCP documentation confirms OAuth support, but does not document its exact client-registration and callback behavior as explicitly as Claude, Gemini, Cursor, or VS Code.

For that reason, OAuth with this JamRelay release should be treated as **compatible by protocol but not yet end-to-end verified** until exercised with a current Windsurf build.

## Bearer fallback

If automatic OAuth does not complete, use JamRelay's static Bearer mode:

```json
{
  "mcpServers": {
    "jamrelay": {
      "serverUrl": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:JAMRELAY_API_KEY}"
      }
    }
  }
}
```

## Tool count

Windsurf currently documents a limit of 100 MCP tools available to Cascade at one time. JamRelay's current tool count is below that limit.

## Verify

```text
Use JamRelay to tell me what is currently playing on Spotify.
```

## Official reference

- https://docs.windsurf.com/windsurf/cascade/mcp
