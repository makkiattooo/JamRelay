---
title: Claude
description: Connect JamRelay to Claude hosted surfaces or Claude Code using remote MCP OAuth.
---

# Claude

Claude supports remote MCP connectors with OAuth. JamRelay supports the registration paths Claude currently documents: **Dynamic Client Registration (DCR)** and pre-configured client credentials.

## Claude.ai, Claude Desktop, mobile, and Cowork

For hosted Claude surfaces, the simplest JamRelay setup is DCR:

```dotenv
PUBLIC_BASE_URL=https://mcp.example.com
MCP_OAUTH_OWNER_SECRET=<STRONG_OWNER_SECRET>
MCP_OAUTH_DCR_ENABLED=true
```

Add the connector URL:

```text
https://mcp.example.com/mcp
```

Claude discovers JamRelay's protected-resource metadata, authorization-server metadata, and registration endpoint automatically.

Anthropic documents this hosted callback:

```text
https://claude.ai/api/mcp/auth_callback
```

With DCR, Claude registers its callback with JamRelay automatically. If you instead use Claude's **Advanced settings** with a static Client ID and Client Secret, add that callback to the corresponding JamRelay static client.

## Claude Code

Claude Code supports automatic OAuth discovery for remote HTTP MCP servers. Add the server on the host, then authenticate from `/mcp`. Local Claude Code can use the host loopback URL printed by setup (including a custom Docker-published port); remote cloud connectors require public HTTPS:

```bash
claude mcp add --transport http jamrelay https://mcp.example.com/mcp
```

Claude Code normally uses a local loopback callback on an available port. DCR lets it register that callback automatically, so you do not need to predict the port.

If you need a fixed pre-registered redirect, Claude Code also supports `--callback-port` together with a static client ID.

## Network requirement

Hosted Claude connectors are reached from Anthropic's cloud infrastructure, not directly from the local Claude Desktop process. The remote JamRelay endpoint therefore needs to be publicly reachable over HTTPS.

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

## Verified stages

`jamrelay connect client claude-code` detects the local CLI and offers the exact registration operation for confirmation. In Docker it prints a PowerShell-compatible host command; the container cannot configure the host. `claude mcp get jamrelay` verifies registration only. After `/mcp` browser OAuth and actual tool discovery, run `jamrelay connect client claude-code --verify`. Music-account authorization and connection grants remain separate.

`jamrelay connect client claude-desktop` describes the remote Connector flow. It does not install or simulate a local Claude Desktop extension, and it rejects private localhost for the cloud Connector.
