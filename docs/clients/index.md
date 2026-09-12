---
title: AI client compatibility
description: Connect TuneLink to ChatGPT, Claude, Gemini CLI, Cursor, VS Code, Windsurf, and MCP Inspector.
---

# AI client compatibility

TuneLink exposes a remote MCP Streamable HTTP endpoint:

```text
https://mcp.example.com/mcp
```

It supports two authentication families:

- **MCP OAuth** — recommended for clients with first-class OAuth support;
- **static Bearer token** — useful for debugging and clients that allow custom HTTP headers.

## Multi-client OAuth

TuneLink no longer has a one-client/one-callback limitation. A single deployment can keep an existing static ChatGPT client while also accepting automatically registered native/CLI clients through DCR.

Available registration paths:

```text
legacy single static client     ✅ backwards compatible
multi-client static registry    ✅
Dynamic Client Registration     ✅
public OAuth clients            ✅
confidential OAuth clients      ✅
CIMD                            not advertised yet
```

See [OAuth and multi-client compatibility](./oauth-compatibility) for the registration model and current MCP-spec note about CIMD.

## Compatibility matrix

| Client                 | Remote Streamable HTTP | OAuth | Bearer/custom headers           | Recommended TuneLink mode       | Status                      |
| ---------------------- | ---------------------- | ----- | ------------------------------- | --------------------------------- | --------------------------- |
| ChatGPT                | ✅                     | ✅    | custom-app UI is OAuth-oriented | static OAuth                      | previously verified         |
| Claude hosted surfaces | ✅                     | ✅    | not primary connector path      | DCR                               | protocol path implemented   |
| Claude Code            | ✅                     | ✅    | dynamic headers also supported  | DCR                               | protocol path implemented   |
| Gemini CLI             | ✅                     | ✅    | ✅                              | DCR                               | protocol path implemented   |
| Cursor                 | ✅                     | ✅    | ✅                              | DCR or static OAuth               | protocol path implemented   |
| VS Code + Copilot      | ✅                     | ✅    | ✅                              | DCR                               | protocol path implemented   |
| Windsurf Cascade       | ✅                     | ✅    | ✅                              | OAuth discovery / Bearer fallback | not yet verified end-to-end |
| MCP Inspector          | ✅                     | ✅    | ✅                              | OAuth or Bearer                   | developer verification tool |

“Protocol path implemented” means TuneLink now implements the registration/callback behavior documented by that vendor. It is not a certification that every current client build has been manually exercised against this exact release.

## Test prompts

Read test:

```text
What is currently playing on Spotify?
```

Write test:

```text
Create a private playlist called MCP Test and add two tracks to it.
```

## Client guides

- [ChatGPT](./chatgpt)
- [Claude](./claude)
- [Gemini CLI](./gemini)
- [Cursor](./cursor)
- [VS Code + GitHub Copilot](./vscode-copilot)
- [Windsurf Cascade](./windsurf)
- [MCP Inspector](./mcp-inspector)
- [OAuth and multi-client compatibility](./oauth-compatibility)

_Last reviewed against vendor documentation: 2026-09-12._
