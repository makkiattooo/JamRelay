---
title: Codex CLI and Desktop
description: Connect Codex to a local or public JamRelay MCP server.
---

# Codex CLI and Desktop

Codex CLI and the Codex desktop app use the same user MCP configuration. On the Windows host, register JamRelay with the host-facing URL (including the configured Docker port):

```powershell
codex mcp add jamrelay --url http://127.0.0.1:5267/mcp
codex mcp list
```

Replace `5267` with the published host port. When Codex CLI is not installed, add this to `%USERPROFILE%\.codex\config.toml`:

```toml
[mcp_servers.jamrelay]
url = "http://127.0.0.1:5267/mcp"
```

Restart or reload Codex if needed, enable JamRelay, then complete OAuth in the client when prompted. `codex mcp list` confirms registration only. After authorization, ask Codex to list JamRelay tools and run `jamrelay connect client codex --verify` to verify server-observed authentication and tool discovery. Provider accounts (such as Spotify) require their own separate authorization.

For a remote JamRelay server, use its public HTTPS `/mcp` URL. A cloud-hosted client cannot reach private `127.0.0.1` on your computer. Never put the JamRelay owner password, Spotify credentials, recovery secret or encryption key in Codex configuration.

Official instructions: [Codex MCP servers](https://developers.openai.com/codex/mcp).
