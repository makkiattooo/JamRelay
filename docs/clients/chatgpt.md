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

Use the client ID and client secret configured in JamRelay. Do **not** use the Spotify client ID or Spotify client secret here.

## Callback

Copy the callback displayed by ChatGPT **exactly**. JamRelay validates redirect URIs exactly for pre-registered clients.

## Owner approval

When ChatGPT starts authorization, JamRelay displays the owner approval page. Enter:

```dotenv
MCP_OAUTH_OWNER_SECRET=...
```

That secret is local to JamRelay and is never given to ChatGPT or Spotify.

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
