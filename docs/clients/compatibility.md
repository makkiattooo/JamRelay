---
title: Client compatibility
description: Current JamRelay MCP transport and authentication compatibility across popular AI clients.
---

# Client compatibility

This matrix separates **protocol compatibility** from **end-to-end verification**. A client can implement a compatible OAuth flow without that exact client/version having been manually exercised against this JamRelay release.

| Client                                | Remote Streamable HTTP | OAuth path supported by JamRelay                                                      | Recommended setup                | JamRelay verification                                 |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------- |
| ChatGPT custom MCP app                | yes                    | pre-registered confidential client                                                    | static OAuth client              | verified previously                                   |
| Claude.ai / Desktop / mobile / Cowork | yes                    | DCR or static client credentials                                                      | DCR                              | protocol path implemented; re-test after this release |
| Claude Code                           | yes                    | DCR, or static client credentials                                                     | DCR                              | protocol path implemented; re-test after this release |
| Gemini CLI                            | yes                    | DCR public client                                                                     | DCR                              | protocol path implemented; re-test after this release |
| Cursor                                | yes                    | DCR or static client credentials                                                      | static or DCR                    | protocol path implemented; re-test after this release |
| VS Code / Copilot                     | yes                    | DCR or configured client ID                                                           | DCR                              | protocol path implemented; re-test after this release |
| Windsurf Cascade                      | yes                    | OAuth is supported by Windsurf; registration details are less explicit in vendor docs | OAuth discovery, Bearer fallback | not yet verified                                      |
| MCP Inspector                         | yes                    | DCR/static OAuth plus Bearer                                                          | DCR or Bearer                    | Bearer/protocol debugging verified previously         |

JamRelay now supports several OAuth clients simultaneously. It no longer requires changing one global redirect URI when moving between ChatGPT, Claude, Gemini, Cursor, or VS Code.

> [!NOTE]
> The MCP 2026-07-28 specification prefers **Client ID Metadata Documents (CIMD)** for new client registration. JamRelay currently provides the static registry and RFC 7591 DCR and does not advertise CIMD yet. See [MCP OAuth registration](/clients/oauth-compatibility).
