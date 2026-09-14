# Spotify provider

Spotify is a provider adapter, not a bootstrap requirement. JamRelay can start
with no Spotify configuration and remains healthy with zero providers.

Configuration requires `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and
`SPOTIFY_REDIRECT_URI` together. `SPOTIFY_MARKET` defaults to `PL` and
`SPOTIFY_READ_CONCURRENCY` defaults to `12`. Authorization is Spotify OAuth;
the resulting credentials are held in the encrypted provider credential store.

The adapter supports identity, catalog/search, playlist reads and writes,
library operations, playback controls/devices, and recently played history,
subject to Spotify account scopes and API availability. Playlist writes require
an explicit or unambiguous `connection_id`; destructive operations use the
snapshot/verify/undo safety path. Playback chapter tools use Spotify's playlist
context and an offset; Spotify controls what happens after the selected range.

Existing Spotify data can be represented in canonical tracks and provider
mappings. The active credential path is `PROVIDER_CREDENTIAL_STORE_PATH`; do
not place tokens in documentation or source-controlled files.
