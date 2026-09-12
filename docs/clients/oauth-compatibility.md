---
title: OAuth and multi-client compatibility
description: How TuneLink supports several MCP OAuth clients on one deployment using pre-registration and Dynamic Client Registration.
---

# OAuth and multi-client compatibility

TuneLink separates two unrelated authorization layers:

```text
AI / MCP client
   │
   │ MCP OAuth or static Bearer
   ▼
TuneLink
   │
   │ Spotify OAuth
   ▼
Spotify Web API
```

The MCP client never receives the Spotify client secret, Spotify refresh token, token-encryption key, or TuneLink owner approval secret.

## One deployment, several clients

A single TuneLink deployment can now accept all of these simultaneously:

1. the existing legacy pre-registered client from `MCP_OAUTH_CLIENT_ID`, `MCP_OAUTH_CLIENT_SECRET`, and `MCP_OAUTH_REDIRECT_URI`;
2. any number of operator-defined pre-registered clients from `MCP_OAUTH_CLIENTS_PATH`;
3. dynamically registered clients through `/oauth/register` when `MCP_OAUTH_DCR_ENABLED=true`;
4. public OAuth clients using PKCE with `token_endpoint_auth_method=none`;
5. confidential clients using `client_secret_basic` or `client_secret_post`;
6. the optional static `MCP_API_KEY` Bearer path for debugging/manual clients.

The legacy client remains supported so an existing ChatGPT connection does not need to be recreated just to add Gemini CLI, Claude, Cursor, VS Code, or another client.

## Current MCP registration landscape

The MCP 2026-07-28 specification moved toward **Client ID Metadata Documents (CIMD)** and formally deprecated DCR as the long-term registration mechanism. DCR remains available for backwards compatibility and is still documented by several major deployed clients.

TuneLink therefore implements:

```text
pre-registration  ✅
DCR               ✅
CIMD              not advertised yet
```

CIMD requires the authorization server to fetch a client-controlled HTTPS metadata URL. TuneLink does not advertise CIMD until that outbound-fetch path can be implemented with a deliberately hardened SSRF/DNS-rebinding model rather than adding an arbitrary server-side fetch feature casually.

## Client behavior checked on 2026-09-12

| Client                 | Vendor-documented behavior                                                                                                                                                                                            | Best current TuneLink path                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| ChatGPT custom MCP app | user-defined OAuth client with an exact callback; confidential client credentials supported                                                                                                                           | legacy/static pre-registration                            |
| Claude hosted surfaces | DCR is supported; a custom client ID and client secret can also be supplied. Claude documents `https://claude.ai/api/mcp/auth_callback` as its callback.                                                              | DCR, or static pre-registration                           |
| Claude Code            | remote MCP OAuth uses MCP discovery/registration behavior; use DCR where supported or pre-register credentials when needed                                                                                            | DCR or static pre-registration                            |
| Gemini CLI             | automatic discovery and DCR; random localhost callback by default; validates RFC 9207 `iss`                                                                                                                           | DCR public client                                         |
| Cursor                 | OAuth is supported for remote MCP; static OAuth credentials are documented. Current callbacks are `https://www.cursor.com/agents/mcp/oauth/callback` for web/Agents and `http://localhost:8787/callback` for Desktop. | DCR or static registry                                    |
| VS Code / Copilot      | starts with DCR and can fall back to configured client credentials; documented redirect URLs are `http://127.0.0.1:33418` and `https://vscode.dev/redirect`                                                           | DCR                                                       |
| Windsurf               | OAuth is supported for stdio, Streamable HTTP and SSE; public docs do not currently specify one universal callback/registration contract                                                                              | OAuth discovery when supported; Bearer remains a fallback |
| MCP Inspector          | standards-oriented OAuth debugging                                                                                                                                                                                    | DCR/static/Bearer depending on test                       |

> [!NOTE]
> Client support does not mean every row has been manually tested end-to-end against this exact release. TuneLink implements the vendor-documented protocol path; keep untested clients labelled as such until verified.

## Automatic DCR flow

For clients such as Gemini CLI, Claude Code, or VS Code:

```text
1. client calls /mcp without a token
2. TuneLink returns 401 + WWW-Authenticate resource_metadata
3. client reads protected-resource metadata
4. client reads authorization-server metadata
5. client POSTs its metadata to /oauth/register
6. client opens /oauth/authorize with PKCE S256
7. owner enters MCP_OAUTH_OWNER_SECRET
8. TuneLink redirects to the client's registered callback with code + state + iss
9. client POSTs /oauth/token
10. client calls /mcp with the access token
11. refresh tokens rotate when refreshed
```

A DCR registration alone grants **no Spotify access**. Owner approval is still required before TuneLink issues an authorization code.

## Static multi-client registry

Start from:

```text
examples/mcp-oauth-clients.example.json
```

and copy it to the path configured by `MCP_OAUTH_CLIENTS_PATH`.

Example:

```json
{
  "clients": [
    {
      "clientId": "chatgpt-tunelink",
      "clientName": "ChatGPT",
      "clientSecret": "REPLACE_ME",
      "redirectUris": ["https://chatgpt.com/connector/oauth/REPLACE_WITH_CALLBACK_ID"],
      "tokenEndpointAuthMethods": ["client_secret_basic", "client_secret_post"]
    },
    {
      "clientId": "vscode-tunelink",
      "clientName": "VS Code",
      "redirectUris": ["http://127.0.0.1:33418", "https://vscode.dev/redirect"],
      "tokenEndpointAuthMethods": ["none"],
      "applicationType": "native"
    }
  ]
}
```

Restart TuneLink after changing the static registry.

## Redirect URI policy

TuneLink always validates the authorization request against redirect URIs registered for that exact client.

It accepts:

- HTTPS callbacks;
- HTTP callbacks only on `localhost`, `127.0.0.1`, or `::1`;
- private-use URI schemes only for DCR/static clients explicitly declared as `application_type=native` / `applicationType: "native"`.

It rejects ordinary remote HTTP callbacks and content/file schemes such as `file:`, `data:`, and `javascript:`.

This supports browser-hosted clients and RFC 8252-style native clients without creating a broad arbitrary-HTTP redirect policy.

## Resource and issuer binding

The protected resource is:

```text
https://mcp.example.com/mcp
```

TuneLink validates a supplied OAuth `resource` parameter against that endpoint. Omission is temporarily tolerated for compatibility with older clients.

Authorization redirects include:

```text
iss=https://mcp.example.com
```

Gemini CLI explicitly requires this RFC 9207 issuer binding, and the MCP 2026-07-28 specification also hardened authorization around `iss`.

## Discovery endpoints

TuneLink serves both protected-resource discovery forms:

```text
/.well-known/oauth-protected-resource
/.well-known/oauth-protected-resource/mcp
```

The second path-suffixed form improves compatibility with clients that follow RFC 9728 discovery from a protected resource hosted at `/mcp`.

Authorization-server metadata is available at:

```text
/.well-known/oauth-authorization-server
```

## Official references checked 2026-09-12

- MCP 2026-07-28 authorization changes: https://blog.modelcontextprotocol.io/posts/2026-07-28/
- MCP client registration background / CIMD: https://blog.modelcontextprotocol.io/posts/client_registration/
- ChatGPT custom MCP/developer mode: https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
- ChatGPT user-defined OAuth client example: https://help.openai.com/en/articles/20001249
- Claude connector authentication: https://claude.com/docs/connectors/building/authentication
- Claude Code MCP OAuth: https://code.claude.com/docs/en/mcp
- Gemini CLI MCP OAuth: https://geminicli.com/docs/tools/mcp-server/
- Cursor MCP: https://cursor.com/docs/mcp
- VS Code MCP developer guide: https://code.visualstudio.com/api/extension-guides/ai/mcp
- VS Code MCP configuration: https://code.visualstudio.com/docs/agents/reference/mcp-configuration
- Windsurf Cascade MCP: https://docs.windsurf.com/windsurf/cascade/mcp
- MCP Inspector: https://github.com/modelcontextprotocol/inspector
