# Getting started

JamRelay is a self-hosted MCP server for Spotify, SoundCloud, Apple Music and
YouTube. You can start with no connected providers. Provider features differ;
Spotify playback requires an eligible account and active device.

## 1. Install and configure

Follow the canonical [installation guide](/installation) for npm, development
archives, source checkouts or Docker. Run `jamrelay setup` to configure private
storage, owner security and optional providers. Node.js 22.13 or later is required
for the Node executable.

## 2. Authorize your music accounts

Obtain developer credentials for the [providers](/providers/) you want to use.
Sign in at `/owner/login`, open `/auth/providers/PROVIDER/start` and explicitly
approve the connection. Complete the callback in the same browser.
[Provider connections](/provider-connections) explains Apple Music's separate
MusicKit token flow and connection restrictions.

## 3. Connect your AI client

Add the `/mcp` URL shown by setup to a [compatible client](/clients/). Complete
owner OAuth consent for the connections and permissions you want to grant.
Request `tools/list` to verify discovery. Provider login and MCP consent are
separate operations; never give your owner secret to an AI agent.

## 4. Try a workflow

Start with a read operation or [playlist dry run](/playlist-automation). Consult
the [tool reference](/tools-reference) for arguments and [provider capabilities](/providers/capabilities)
for limitations. Use the [operator CLI](/operations) to inspect jobs, revoke
clients or create backups. Read [security](/security) before exposing the service.
