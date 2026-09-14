# MCP tools

The server exposes 115 tools grouped around provider-neutral workflows. Tool
schemas are the source of truth and are validated by tests. Catalog, playlist,
transfer, import/export, chapter, history, diagnostics, and provider management
tools work through capabilities rather than assuming Spotify parity.

Writes require an explicit or uniquely resolvable capable `connection_id`.
Ambiguous, unavailable, or revoked targets fail closed.

## Catalog and discovery

`search_tracks`, `search_artists`, `search_albums`, `get_track`, `get_artist`, `find_track_exact`, and `find_playlist_by_name` are reads. `get_artist_top_tracks` reports `spotify_feature_removed` because Spotify removed that endpoint.

## Playlists

Reads: `get_my_playlists`, `get_playlist`, `get_playlist_tracks`, `get_playlist_stats`. Writes: `create_playlist`, `add_tracks_to_playlist`, `remove_tracks_from_playlist`, `reorder_playlist_tracks`, `replace_playlist_tracks`, `update_playlist_details`, `add_tracks_by_search`, `bulk_add_tracks`, `deduplicate_playlist`, `create_playlist_from_tracks`. Writes are chunked and report partial failures; replacement and deduplication attempt rollback after later-chunk failures.

## Library and personal data

`get_saved_tracks`, `save_tracks`, `remove_saved_tracks`, and `check_saved_tracks` use `/me/library`; `get_top_tracks`, `get_top_artists`, and `get_recently_played` read personalized data.

## Playback

Reads: `get_currently_playing`, `get_playback_state`, `get_devices`. Writes: `play`, `pause`, `next_track`, `previous_track`, `seek`, `set_volume`, `transfer_playback`. Premium, an active compatible device, and account permissions may be required.

Example request: “What is currently playing?” → `get_currently_playing`.

## Durable bulk jobs

`create_bulk_job`, `get_job_status`, `list_jobs`, `resume_job`, `commit_job`, and `cancel_job` manage persisted bulk work. The single in-process worker resolves bounded batches and resumes eligible work after restart. Phases are `created`, `resolving`, `waiting_rate_limit`, `ready_to_commit`, `committing`, `completed`, and `failed`; interrupted resolution may resume, while interrupted committing is failed for manual review and is never automatically retried.

Normal progress and rate-limit waiting do not consume retry attempts. Actual retryable failures increment `attempts`; `max_attempts` stops automatic processing. `commit_job` preserves strict/dry-run/skip options, re-checks `skip_existing`, preserves duplicate removal and ordering, and performs no Spotify mutation for dry runs. Strict jobs cannot commit unresolved items. External writes have no exactly-once guarantee; uncertain outcomes require manual review rather than blind retry.

`get_state_diagnostics`, `get_rate_limit_status`, and `get_recent_api_errors` expose bounded authenticated diagnostics only. API error history contains normalized fields and no raw request/response bodies or secrets. Resolver alias conflicts are not silently overwritten.
