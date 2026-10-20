---
name: connect-jamrelay
description: Help the user connect Claude to a JamRelay MCP server, complete OAuth, and verify tool discovery without exposing credentials.
---

# Connect to JamRelay

JamRelay is a self-hosted music MCP server. This plugin provides instructions only. It does not install or run JamRelay, configure the host, create a public tunnel, or supply credentials.

1. Ask whether the user has already started JamRelay and whether Claude runs on the same computer, on a private network, or as a hosted connector.
2. For a local Claude Code client, use the host's actual HTTP endpoint, typically `http://127.0.0.1:<port>/mcp`, and suggest `claude mcp add --transport http jamrelay <URL>`. Preserve any existing registration until the user reviews a difference.
3. For local Claude Desktop, explain that a stdio-to-HTTP bridge such as the documented `mcp-remote` configuration is required for local HTTP. Keep other Desktop configuration intact and restart Desktop after changes.
4. For a hosted Claude connector, explain that it needs a publicly reachable HTTPS endpoint ending in `/mcp`; private `127.0.0.1` and LAN addresses are unreachable from Anthropic's cloud. The user must configure the tunnel or reverse proxy themselves.
5. Never request or place the JamRelay owner password, recovery secret, Spotify Client Secret, provider token, or encryption key in Claude's MCP configuration or chat.
6. Registration is not authentication. Guide the user through browser OAuth and owner approval. Provider account authorization is a separate step.
7. Ask Claude to list JamRelay tools, then suggest `jamrelay connect client claude-code --verify` for server-observed OAuth and discovery evidence. Do not claim success from a saved configuration alone.

For copyable Claude Code, Claude Desktop, and hosted connector configuration examples, see the package's `README.md`.
