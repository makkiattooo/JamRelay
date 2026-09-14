# Provider-neutral playlist import/export

JamRelay exposes `preview_playlist_import`, `import_playlist` and
`export_playlist`. These operations work without a connected provider and do
not perform provider writes. A separate, explicit transfer/write operation is
required to publish imported tracks.

## Input formats

- **JSON** — native `jamrelay-playlist` document, currently `version: 1`, with
  an ordered `tracks` array. Each track may include canonical `track_id` and
  optional provider mapping provenance.
- **CSV** — the header is `position,title,artist,album,uri,track_id,provider_id,connection_id,provider_track_id,provider_uri`.
  Fields use standard CSV quoting; Unicode is supported.
- **M3U8** — UTF-8 `#EXTM3U` playlists. `#EXTINF:seconds,Artist - Title`
  metadata is optional; each following non-comment line is an ordered URI.
- **TXT** — UTF-8 tab-separated columns `title`, `artist`, `album`, `uri`.
  The header is optional.

Order and duplicate entries are preserved. Items without a canonical ID,
provider mapping or URI are returned in `unresolved`; the parser never
invents an identity. Input is bounded to 1 MiB and 10,000 tracks, with at
most 50 structured parse/validation errors reported.
