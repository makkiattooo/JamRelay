---
title: Claude
description: Connect TuneLink to Claude hosted surfaces or Claude Code using remote MCP OAuth.
---

# Claude

Claude supports remote MCP connectors with OAuth. TuneLink supports the registration paths Claude currently documents: **Dynamic Client Registration (DCR)** and pre-configured client credentials.

## Claude.ai, Claude Desktop, mobile, and Cowork

For hosted Claude surfaces, the simplest TuneLink setup is DCR:

```dotenv
PUBLIC_BASE_URL=https://mcp.example.com
MCP_OAUTH_OWNER_SECRET=<STRONG_OWNER_SECRET>
MCP_OAUTH_DCR_ENABLED=true
```

Add the connector URL:

```text
https://mcp.example.com/mcp
```

Claude discovers TuneLink's protected-resource metadata, authorization-server metadata, and registration endpoint automatically.

Anthropic documents this hosted callback:

```text
https://claude.ai/api/mcp/auth_callback
```

With DCR, Claude registers its callback with TuneLink automatically. If you instead use Claude's **Advanced settings** with a static Client ID and Client Secret, add that callback to the corresponding TuneLink static client.

## Claude Code

Claude Code supports automatic OAuth discovery for remote HTTP MCP servers. Add the server, then authenticate from `/mcp`:

```bash
claude mcp add --transport http tunelink https://mcp.example.com/mcp
```

Claude Code normally uses a local loopback callback on an available port. DCR lets it register that callback automatically, so you do not need to predict the port.

If you need a fixed pre-registered redirect, Claude Code also supports `--callback-port` together with a static client ID.

## Network requirement

Hosted Claude connectors are reached from Anthropic's cloud infrastructure, not directly from the local Claude Desktop process. The remote TuneLink endpoint therefore needs to be publicly reachable over HTTPS.

## Verify

```text
What is currently playing on Spotify?
```

Then:

```text
List my Spotify playback devices.
```

## Official references

- https://claude.com/docs/connectors/building/authentication
- https://claude.com/docs/connectors/building
- https://code.claude.com/docs/en/mcp
- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
