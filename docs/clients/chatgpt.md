---
title: ChatGPT
description: Connect TuneLink to ChatGPT using a remote MCP server and a pre-registered OAuth client.
---

# ChatGPT

TuneLink can be connected to ChatGPT as a custom remote MCP app using a public HTTPS endpoint.

> [!NOTE]
> Product labels and availability can vary by ChatGPT plan, workspace, account, and rollout. The UI may use terms such as **Apps**, **Plugins**, **Custom app**, or **Developer mode**.

## Recommended OAuth mode

For ChatGPT, use a **pre-registered confidential OAuth client**. ChatGPT shows an exact callback URL during setup and allows you to enter your own client ID and client secret.

An existing TuneLink deployment using the legacy variables remains supported:

```dotenv
MCP_OAUTH_CLIENT_ID=chatgpt-tunelink
MCP_OAUTH_CLIENT_SECRET=<STRONG_RANDOM_SECRET>
MCP_OAUTH_REDIRECT_URI=<EXACT_CALLBACK_FROM_CHATGPT>
MCP_OAUTH_OWNER_SECRET=<OWNER_APPROVAL_SECRET>
```

You can also move the ChatGPT client into `MCP_OAUTH_CLIENTS_PATH` if you want all static clients in one registry file. DCR can remain enabled at the same time for Claude, Gemini CLI, VS Code, and other clients.

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

Use the client ID and client secret configured in TuneLink. Do **not** use the Spotify client ID or Spotify client secret here.

## Callback

Copy the callback displayed by ChatGPT **exactly**. TuneLink validates redirect URIs exactly for pre-registered clients.

## Owner approval

When ChatGPT starts authorization, TuneLink displays the owner approval page. Enter:

```dotenv
MCP_OAUTH_OWNER_SECRET=...
```

That secret is local to TuneLink and is never given to ChatGPT or Spotify.

## Verify

Start a fresh conversation with TuneLink enabled and try:

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
