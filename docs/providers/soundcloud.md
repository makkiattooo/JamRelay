# SoundCloud provider

SoundCloud uses the configured OAuth flow with PKCE and stores its connection
credentials in the encrypted provider credential store. Configure
`SOUNDCLOUD_CLIENT_ID`, `SOUNDCLOUD_CLIENT_SECRET`, and
`SOUNDCLOUD_REDIRECT_URI` together.

The adapter currently exposes identity, catalog track search/get, playlist
listing/reading, and playlist writes. SoundCloud is not documented as a
Spotify-equivalent service: the adapter does not declare library, playback, or
history capabilities. Track identity is based on SoundCloud resource IDs or
supported URLs and is mapped to JamRelay canonical entities where matching is
possible.

Provider scopes, API availability, rate limits, and account permissions remain
upstream constraints. Inspect the connection capabilities before selecting a
write target.
