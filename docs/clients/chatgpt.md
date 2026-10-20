---
title: ChatGPT
description: Connect JamRelay to ChatGPT using a remote MCP server and a pre-registered OAuth client.
---

# ChatGPT

JamRelay can be connected to ChatGPT as a custom remote MCP app using a public HTTPS endpoint.

> [!NOTE]
> Product labels and availability can vary by ChatGPT plan, workspace, account, and rollout. The UI may use terms such as **Apps**, **Plugins**, **Custom app**, or **Developer mode**.

## Recommended OAuth mode

For ChatGPT, use a **pre-registered confidential OAuth client**. ChatGPT shows an exact callback URL during setup and allows you to enter your own client ID and client secret.

Register the ChatGPT client in the static registry file:

```json
{
  "clients": [
    {
      "clientId": "chatgpt-jamrelay",
      "clientName": "ChatGPT",
      "clientSecret": "<STRONG_RANDOM_SECRET>",
      "redirectUris": ["<EXACT_CALLBACK_FROM_CHATGPT>"]
    }
  ]
}
```

Set `MCP_OAUTH_CLIENTS_PATH` to this file and set
`MCP_OAUTH_OWNER_SECRET` for approval. DCR can remain enabled at the same time
for Claude, Gemini CLI, VS Code, and other clients.

## Configure ChatGPT

When creating the custom MCP app, use:

```text
Name: JamRelay
Description: Use your connected music services through JamRelay's self-hosted MCP server.
Server URL: https://mcp.example.com/mcp
Authentication: OAuth
```

If the form requests an icon, try the square JamRelay PNG files: [light icon](../../assets/brand/masters/jamrelay-icon-black-transparent-1024.png) or [dark icon](../../assets/brand/masters/jamrelay-icon-white-transparent-1024.png). The files are 1024×1024 PNGs; follow any size or format limits shown by ChatGPT.

ChatGPT runs the connector from its hosted service. A local `127.0.0.1` or private LAN URL will not work. Use a publicly reachable HTTPS origin from `jamrelay connectivity` (a tunnel or reverse proxy is sufficient) and keep `/mcp` on the server URL. If you open **Advanced OAuth settings**, configure the endpoints below for that same origin:

Use:

```text
Server URL
https://mcp.example.com/mcp

Authentication
OAuth

Authorization URL
https://mcp.example.com/oauth/authorize

Token URL
https://mcp.example.com/oauth/token

Authorization server / issuer
https://mcp.example.com

Resource
https://mcp.example.com/mcp

Token endpoint authentication
client_secret_basic
```

The client ID and secret belong to JamRelay's MCP OAuth static registry, not Spotify. Use the exact callback ChatGPT displays when adding that client to `MCP_OAUTH_CLIENTS_PATH`. Leave optional advanced fields at their defaults when ChatGPT successfully discovers JamRelay's OAuth metadata automatically.

## Callback

Copy the callback displayed by ChatGPT **exactly**. JamRelay validates redirect URIs exactly for pre-registered clients.

## Owner approval

When ChatGPT starts authorization, enter the configured owner password on the JamRelay approval page. Recovery/legacy `MCP_OAUTH_OWNER_SECRET` remains an alternative. Set or migrate the password with `jamrelay owner password` while stopped. Neither credential is given to ChatGPT or Spotify. New grants default to read access; opt into writes only when needed.

Saving OAuth settings does not authorize the owner or connect a music account. Complete browser authorization, approve the requested JamRelay permissions, then enable the app and ask ChatGPT to list JamRelay tools. Verify the actual server-observed login and tool discovery with `jamrelay connect client chatgpt --verify`.

## Verify

Start a fresh conversation with JamRelay enabled and try:

```text
What is currently playing on Spotify?
```

Then test a write action:

```text
Create a private playlist called MCP Test.
```

## Official references

- https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
- https://help.openai.com/en/articles/20001249
- https://developers.openai.com/plugins/build/auth
