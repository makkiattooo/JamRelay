---
title: Client compatibility
description: Current TuneLink MCP transport and authentication compatibility across popular AI clients.
---

# Client compatibility

This matrix separates **protocol compatibility** from **end-to-end verification**. A client can implement a compatible OAuth flow without that exact client/version having been manually exercised against this TuneLink release.

| Client                                | Remote Streamable HTTP | OAuth path supported by TuneLink                                                    | Recommended setup                | TuneLink verification                               |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------- |
| ChatGPT custom MCP app                | yes                    | pre-registered confidential client                                                    | static OAuth client              | verified previously                                   |
| Claude.ai / Desktop / mobile / Cowork | yes                    | DCR or static client credentials                                                      | DCR                              | protocol path implemented; re-test after this release |
| Claude Code                           | yes                    | DCR, or static client credentials                                                     | DCR                              | protocol path implemented; re-test after this release |
| Gemini CLI                            | yes                    | DCR public client                                                                     | DCR                              | protocol path implemented; re-test after this release |
| Cursor                                | yes                    | DCR or static client credentials                                                      | static or DCR                    | protocol path implemented; re-test after this release |
| VS Code / Copilot                     | yes                    | DCR or configured client ID                                                           | DCR                              | protocol path implemented; re-test after this release |
| Windsurf Cascade                      | yes                    | OAuth is supported by Windsurf; registration details are less explicit in vendor docs | OAuth discovery, Bearer fallback | not yet verified                                      |
| MCP Inspector                         | yes                    | DCR/static OAuth plus Bearer                                                          | DCR or Bearer                    | Bearer/protocol debugging verified previously         |

TuneLink now supports several OAuth clients simultaneously. It no longer requires changing one global redirect URI when moving between ChatGPT, Claude, Gemini, Cursor, or VS Code.

> [!NOTE]
> The MCP 2026-07-28 specification prefers **Client ID Metadata Documents (CIMD)** for new client registration and deprecates DCR long-term. TuneLink currently provides DCR for broad compatibility with deployed clients and does not advertise CIMD yet. See [OAuth and multi-client compatibility](/clients/oauth-compatibility).
