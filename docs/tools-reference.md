---
title: MCP tool reference
description: Generated reference for the MCP tools registered by the server.
---

# MCP tool reference

> **Generated file.** Do not edit this page by hand. Run `npm run docs:generate` after changing MCP tool registrations.

Generated from the runtime tool registry. Current tool count: **45**.

## `add_tracks_by_search`

**Title:** Add tracks by search

**Type:** Write / action

Resolve every search entry before writing; strict mode blocks all writes if any is ambiguous or unmatched.

**Arguments:**

- `playlist_id`
- `tracks`
- `strict`
- `dry_run`
- `skip_existing`

## `add_tracks_to_playlist`

**Title:** Add tracks

**Type:** Write / action

Add tracks sequentially in chunks of at most 100 using /items.

**Arguments:**

- `playlist_id`
- `track_ids`

## `bulk_add_tracks`

**Title:** Bulk add tracks

**Type:** Write / action

Add mixed ID/URI/search track inputs in ordered chunks; supports strict, dry_run and skip_existing.

**Arguments:**

- `playlist_id`
- `tracks`
- `strict`
- `dry_run`
- `skip_existing`

## `cancel_job`

**Title:** Cancel job

**Type:** Read

Cancel a durable job without deleting its history.

**Arguments:**

- `job_id`

## `check_saved_tracks`

**Title:** Check saved tracks

**Type:** Read

Return an exact input-to-saved mapping using current /me/library/contains.

**Arguments:**

- `track_ids`

## `commit_job`

**Title:** Commit job

**Type:** Read

Mark a successfully prepared durable job as completed.

**Arguments:**

- `job_id`

## `create_bulk_job`

**Title:** Create bulk job

**Type:** Read

Persist a bulk track operation for later processing.

**Arguments:**

- `type`
- `payload`
- `items`
- `max_attempts`

## `create_playlist`

**Title:** Create playlist

**Type:** Write / action

Create a playlist; collaborative playlists must be private.

**Arguments:**

- `name`
- `description`
- `public`
- `collaborative`

## `create_playlist_from_tracks`

**Title:** Create playlist from tracks

**Type:** Write / action

Resolves all tracks before creation in strict mode, then creates and inserts sequential chunks.

**Arguments:**

- `name`
- `description`
- `public`
- `tracks`
- `strict`
- `skip_duplicates`

## `deduplicate_playlist`

**Title:** Deduplicate playlist

**Type:** Write / action
**Destructive hint:** yes

Fetches all items, preserves first occurrence and order, and refuses lossless reconstruction when unsupported items exist.

**Arguments:**

- `playlist_id`
- `dry_run`

## `find_playlist_by_name`

**Title:** Find playlist by name

**Type:** Read

Find all current-user playlists matching a normalized name across all pages.

**Arguments:**

- `name`

## `find_track_exact`

**Title:** Find track exactly

**Type:** Read

Resolve a track by deterministic title/artist/album/year scoring; returns matched, ambiguous, or unmatched.

**Arguments:**

- `title`
- `artist`
- `album`
- `year`

## `get_artist`

**Type:** Read

Get a Spotify artist by ID, URI, or URL.

**Arguments:**

- `artist_id`

## `get_artist_top_tracks`

**Title:** Get artist top tracks

**Type:** Read

Spotify removed the official endpoint in February 2026; this tool returns a structured platform limitation.

**Arguments:**

- `artist_id`

## `get_currently_playing`

**Title:** Get currently playing

**Type:** Read

Get the currently playing track or episode; 204 is returned as inactive playback.

**Arguments:**

- None

## `get_devices`

**Title:** Get devices

**Type:** Read

List Spotify Connect devices.

**Arguments:**

- None

## `get_job_status`

**Title:** Get job status

**Type:** Read

Inspect a durable bulk job with bounded item pagination.

**Arguments:**

- `job_id`
- `offset`
- `limit`

## `get_my_playlists`

**Title:** Get my playlists

**Type:** Read

List compact playlists; all=true fetches all pages up to the server safety cap.

**Arguments:**

- `limit`
- `offset`
- `all`

## `get_playback_state`

**Title:** Get playback state

**Type:** Read

Get playback state and normalize either a track or episode item.

**Arguments:**

- None

## `get_playlist`

**Title:** Get playlist

**Type:** Read

Get playlist metadata.

**Arguments:**

- `playlist_id`

## `get_playlist_stats`

**Title:** Get playlist stats

**Type:** Read

Fetches all playlist items and computes local aggregates.

**Arguments:**

- `playlist_id`

## `get_playlist_tracks`

**Title:** Get playlist items

**Type:** Read

Read normalized playlist items using current /items; maximum page size is 50.

**Arguments:**

- `playlist_id`
- `limit`
- `offset`

## `get_recently_played`

**Title:** Get recently played

**Type:** Read

Read recent history; before and after cannot be combined.

**Arguments:**

- `limit`
- `before`
- `after`

## `get_saved_tracks`

**Title:** Get saved tracks

**Type:** Read

Read saved tracks with pagination.

**Arguments:**

- `limit`
- `offset`

## `get_state_diagnostics`

**Title:** Get State DB diagnostics

**Type:** Read

Return authenticated, bounded State DB health counters.

**Arguments:**

- None

## `get_top_artists`

**Type:** Read

Read personalized top Spotify items; Spotify maximum is 50.

**Arguments:**

- `time_range`
- `limit`
- `offset`

## `get_top_tracks`

**Type:** Read

Read personalized top Spotify items; Spotify maximum is 50.

**Arguments:**

- `time_range`
- `limit`
- `offset`

## `get_track`

**Type:** Read

Get a Spotify track by ID, URI, or URL.

**Arguments:**

- `track_id`

## `next_track`

**Type:** Write / action

Control Spotify playback.

**Arguments:**

- `device_id`

## `pause`

**Type:** Write / action

Pause Spotify playback; verifies the resulting state after a 403 restriction response.

**Arguments:**

- `device_id`

## `play`

**Title:** Play

**Type:** Write / action

Start or resume playback; context_uri and uris are mutually exclusive. Verifies the resulting state after a 403 restriction response.

**Arguments:**

- `device_id`
- `context_uri`
- `uris`
- `offset`
- `position_ms`

## `previous_track`

**Type:** Write / action

Control Spotify playback.

**Arguments:**

- `device_id`

## `remove_saved_tracks`

**Type:** Write / action
**Destructive hint:** yes

Save or remove tracks using current /me/library endpoint in chunks of 40.

**Arguments:**

- `track_ids`

## `remove_tracks_from_playlist`

**Title:** Remove playlist items

**Type:** Write / action
**Destructive hint:** yes

Remove requested URI occurrences using DELETE /items and return the final snapshot.

**Arguments:**

- `playlist_id`
- `track_ids`

## `reorder_playlist_tracks`

**Title:** Reorder playlist items

**Type:** Write / action

Reorder with current PUT /items payload.

**Arguments:**

- `playlist_id`
- `range_start`
- `insert_before`
- `range_length`
- `snapshot_id`

## `replace_playlist_tracks`

**Title:** Replace playlist items

**Type:** Write / action
**Destructive hint:** yes

Replace then append ordered chunks, max 100 per request; rolls back after later chunk failure.

**Arguments:**

- `playlist_id`
- `track_ids`

## `resume_job`

**Title:** Resume job

**Type:** Read

Make a durable job eligible for processing.

**Arguments:**

- `job_id`

## `save_tracks`

**Type:** Write / action

Save or remove tracks using current /me/library endpoint in chunks of 40.

**Arguments:**

- `track_ids`

## `search_albums`

**Type:** Read

Search Spotify catalog with current pagination.

**Arguments:**

- `query`
- `limit`

## `search_artists`

**Type:** Read

Search Spotify catalog with current pagination.

**Arguments:**

- `query`
- `limit`

## `search_tracks`

**Type:** Read

Search Spotify catalog with current pagination.

**Arguments:**

- `query`
- `limit`

## `seek`

**Title:** Seek

**Type:** Write / action

Seek to a non-negative position.

**Arguments:**

- `position_ms`
- `device_id`

## `set_volume`

**Title:** Set volume

**Type:** Write / action

Set volume from 0 to 100.

**Arguments:**

- `volume_percent`
- `device_id`

## `transfer_playback`

**Title:** Transfer playback

**Type:** Write / action

Transfer playback to a Spotify Connect device.

**Arguments:**

- `device_id`
- `play`

## `update_playlist_details`

**Title:** Update playlist details

**Type:** Write / action

Update playlist metadata; collaborative playlists must be private.

**Arguments:**

- `playlist_id`
- `name`
- `description`
- `public`
- `collaborative`
