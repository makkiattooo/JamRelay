# MCP tools

The server registers exactly 39 tools. Tool schemas are the source of truth and are validated by tests.

## Catalog and discovery

`search_tracks`, `search_artists`, `search_albums`, `get_track`, `get_artist`, `find_track_exact`, and `find_playlist_by_name` are reads. `get_artist_top_tracks` remains registered for compatibility and returns `spotify_feature_removed` because Spotify removed that endpoint.

## Playlists

Reads: `get_my_playlists`, `get_playlist`, `get_playlist_tracks`, `get_playlist_stats`. Writes: `create_playlist`, `add_tracks_to_playlist`, `remove_tracks_from_playlist`, `reorder_playlist_tracks`, `replace_playlist_tracks`, `update_playlist_details`, `add_tracks_by_search`, `bulk_add_tracks`, `deduplicate_playlist`, `create_playlist_from_tracks`. Writes are chunked and report partial failures; replacement and deduplication attempt rollback after later-chunk failures.

## Library and personal data

`get_saved_tracks`, `save_tracks`, `remove_saved_tracks`, and `check_saved_tracks` use `/me/library`; `get_top_tracks`, `get_top_artists`, and `get_recently_played` read personalized data.

## Playback

Reads: `get_currently_playing`, `get_playback_state`, `get_devices`. Writes: `play`, `pause`, `next_track`, `previous_track`, `seek`, `set_volume`, `transfer_playback`. Premium, an active compatible device, and account permissions may be required.

Example request: “What is currently playing?” → `get_currently_playing`.
