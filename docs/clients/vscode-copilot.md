---
title: VS Code + GitHub Copilot
description: Connect JamRelay to VS Code and GitHub Copilot using remote MCP OAuth.
---

# VS Code + GitHub Copilot

VS Code supports local and remote MCP servers and handles OAuth for remote HTTP servers.

## Recommended option — automatic DCR

The current VS Code MCP developer guide says VS Code first attempts **Dynamic Client Registration**, then falls back to pre-configured client credentials when DCR is unavailable.

With JamRelay DCR enabled, the minimal server entry is:

```json
{
  "servers": {
    "jamrelay": {
      "type": "http",
      "url": "https://mcp.example.com/mcp"
    }
  }
}
```

VS Code opens a browser when authentication is required.

For pre-registration/fallback flows, Microsoft documents these redirect URLs:

```text
http://127.0.0.1:33418
https://vscode.dev/redirect
```

JamRelay can store both URLs on the same static client, so VS Code no longer needs to replace another client's redirect configuration.

## Static Client ID alternative

```json
{
  "servers": {
    "jamrelay": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "oauth": {
        "clientId": "vscode-jamrelay"
      }
    }
  }
}
```

Create `vscode-jamrelay` as a public client in `MCP_OAUTH_CLIENTS_PATH` with `tokenEndpointAuthMethods: ["none"]` and both documented redirect URLs.

## Bearer fallback

You can also use a password input and an `Authorization` header for development/debugging.

## Verify

Open Copilot Chat in Agent mode:

```text
Use JamRelay to show my currently playing Spotify track.
```

## Official references

- https://code.visualstudio.com/api/extension-guides/ai/mcp
- https://code.visualstudio.com/docs/agents/reference/mcp-configuration
