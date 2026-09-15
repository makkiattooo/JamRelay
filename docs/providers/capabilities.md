# Provider capabilities

Capabilities are declared per connection: `identity`, `catalog`,
`playlistRead`, `playlistWrite`, `library`, `playback`, and `history`. The same
provider may have multiple connections with different availability.

Reads may use the configured preferred connection and permitted fallback rules.
Writes resolve exactly one available connection with the requested capability.
If no target is available, or more than one target is possible without an
explicit selection, the operation fails closed. JamRelay never silently writes
to another provider or account.

Tracks are represented internally as canonical entities with provider mappings.
Provider IDs and URLs remain provider-specific evidence; they are not universal
identifiers. Cross-provider transfer therefore plans a match and exposes
confidence/ambiguity before any destination write.

## Playlist operation capabilities

In addition to the legacy high-level `playlistRead` and `playlistWrite`
booleans, provider connections expose granular playlist operations:
`create`, `add`, `remove`, `reorder`, `replace`, and `update`. Generic writes
check the exact operation before provider I/O. For example, YouTube supports
playlist item insertion, deletion, reordering, and metadata updates, but does
not advertise `replace`; a generic replace request fails closed.
