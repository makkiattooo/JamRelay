# JamRelay for Claude

This package contains setup guidance for Claude. It does **not** install, host, or expose JamRelay, and it contains no owner password, Spotify credential, OAuth token, or encryption key. First run JamRelay on a host you control.

## Claude Code

On the computer that runs JamRelay or can reach its network endpoint, register the actual MCP URL:

```powershell
claude mcp add --transport http jamrelay http://127.0.0.1:5267/mcp
claude mcp list
```

Replace the example port with JamRelay's published port. In Claude Code, run `/mcp`, complete browser OAuth, and request the JamRelay tool list. `claude mcp list` only verifies registration.

## Claude Desktop local MCP

For local HTTP endpoints, configure a local stdio-to-HTTP bridge in Claude Desktop's user config. This needs Node.js/npx on the host and does not install JamRelay:

```json
{
  "mcpServers": {
    "jamrelay": {
      "command": "npx",
      "args": ["-y", "mcp-remote@0.15.1", "http://127.0.0.1:5267/mcp", "--allow-http"]
    }
  }
}
```

Keep other configuration entries. Restart Claude Desktop, complete browser OAuth, then request the tool list.

## Claude hosted connectors

Claude hosted connectors reach JamRelay from Anthropic's cloud. They need a publicly reachable HTTPS `/mcp` endpoint, not a private loopback or LAN address. Add the connector in Claude settings and complete OAuth there. A local plugin upload does not create a tunnel or deploy JamRelay.

Use JamRelay's own onboarding to verify actual OAuth and tool discovery. Music provider accounts require separate authorization.
