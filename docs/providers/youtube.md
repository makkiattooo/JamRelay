# YouTube provider

JamRelay integrates the official YouTube Data API, not an unofficial full
YouTube Music API. Configure `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and
`YOUTUBE_REDIRECT_URI` together. OAuth credentials are stored in the encrypted
provider credential store.

The adapter exposes catalog search/get and playlist read/write capabilities.
Music entries are YouTube videos: channel/title metadata is not equivalent to a
recording artist/track identity, and matching is therefore conservative.
`search.list`, `videos.list`, playlist and playlist-item operations consume
YouTube Data API quota. Replace-playlist is unsupported by this adapter, and
playback/library/history capabilities are not declared.
