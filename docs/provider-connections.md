# Provider connections

Spotify, SoundCloud, Apple Music and YouTube remain independent provider adapters. Each configured adapter uses its own default connection ID (`spotify-default`, `soundcloud-default`, `apple-music-default`, `youtube-default`) and encrypted credential record. Configuration enables an adapter; authorization supplies its account credentials.

Use `npm run operator -- connections list` for credential-record inventory. To authorize Spotify, SoundCloud or YouTube, sign in at `/owner/login`, open `/auth/providers/<provider>/start`, and approve that exact connection or replacement. The browser callback must return in the same owner session. Apple Music retains Developer Token configuration and the owner-authenticated Music User Token endpoint. See [configuration](/configuration) and [OAuth](/oauth).

There is no connection-management web application. MCP tools select explicit granted connection IDs and enforce provider capabilities. To change a client's connection selection, repeat MCP owner consent; revoke a client with `npm run operator -- clients revoke CLIENT_ID`. Removing a provider's configuration does not delete its encrypted record, cached playlists or job history. Disconnect access at the provider and stop the service before any credential-file maintenance. Do not delete SQLite state to disconnect a provider.

Queued operations retain the selected provider and connection. Removing that connection causes safe failure, never substitution by Spotify. The built-in browser flow targets configured default connections; it does not provision arbitrary additional accounts.
