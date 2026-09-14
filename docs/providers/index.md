# Provider support

JamRelay uses one provider-neutral service layer over independent
`ProviderConnection` records. Support is capability-based, so a provider can
offer catalog or playlists without pretending to support playback, library, or
history. A deployment can have zero, one, or several connections.

| Provider                     | Status                     | Main implemented surface                            |
| ---------------------------- | -------------------------- | --------------------------------------------------- |
| [Spotify](./spotify)         | Supported                  | Catalog, playlists, library, playback, history      |
| [SoundCloud](./soundcloud)   | Supported, limited         | Identity, catalog, playlists                        |
| [Apple Music](./apple-music) | Supported, token-dependent | Developer token/catalog plus Music User Token flows |
| [YouTube](./youtube)         | Supported, video-based     | Official YouTube Data API catalog and playlists     |
| [TIDAL](/tidal-feasibility)  | Feasibility only           | No adapter or runtime integration                   |

Provider connectivity is operational state, not `/health` readiness. See
[capabilities](./capabilities) and [connection targeting](/provider-connections).
