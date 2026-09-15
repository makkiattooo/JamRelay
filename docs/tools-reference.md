---
title: MCP tool reference
description: Generated reference for the MCP tools registered by the server.
---

# MCP tool reference

> **Generated file.** Do not edit this page by hand. Run `npm run docs:generate` after changing MCP tool registrations.

Generated from the runtime tool registry. Current tool count: **115**.

## `add_tracks_by_search`

**Title:** Add tracks by search

**Type:** Write / action

Resolve every search entry before writing; strict mode blocks all writes if any is ambiguous or unmatched.

**Arguments:**

| Argument        | Type    | Required | Details |
| --------------- | ------- | -------: | ------- |
| `playlist_id`   | unknown |      yes | —       |
| `tracks`        | unknown |      yes | —       |
| `strict`        | unknown |      yes | —       |
| `dry_run`       | unknown |      yes | —       |
| `skip_existing` | unknown |      yes | —       |

## `add_tracks_to_playlist`

**Title:** Add tracks

**Type:** Write / action

Add tracks sequentially in chunks of at most 100 using /items.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `playlist_id`             | unknown |      yes | —       |
| `track_ids`               | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |

## `apply_playlist_recipe`

**Title:** Apply playlist recipe

**Type:** Write / action

Apply a persistent recipe; dry_run defaults true, execution creates one safety snapshot.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `recipe_id`   | unknown |      yes | —       |
| `dry_run`     | unknown |      yes | —       |
| `seed`        | unknown |      yes | —       |

## `archive_playlist`

**Title:** Archive playlist

**Type:** Write / action
**Destructive hint:** yes

Persist an immutable local snapshot/version; no provider mutation.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `label`       | unknown |      yes | —       |

## `avoid_recently_played`

**Title:** Avoid recently played

**Type:** Write / action

Uses only locally observed history; dry_run defaults true.

**Arguments:**

| Argument         | Type    | Required | Details |
| ---------------- | ------- | -------: | ------- |
| `playlist_id`    | unknown |      yes | —       |
| `lookback_hours` | unknown |      yes | —       |
| `lookback_days`  | unknown |      yes | —       |
| `behavior`       | unknown |      yes | —       |
| `dry_run`        | unknown |      yes | —       |

## `balance_artists`

**Title:** Balance artists

**Type:** Write / action
**Destructive hint:** yes

Reorder without removing tracks; dry_run defaults true.

**Arguments:**

| Argument         | Type    | Required | Details |
| ---------------- | ------- | -------: | ------- |
| `playlist_id`    | unknown |      yes | —       |
| `dry_run`        | unknown |      yes | —       |
| `min_artist_gap` | unknown |      yes | —       |
| `strategy`       | unknown |      yes | —       |

## `batch_playlist_jobs`

**Type:** Write / action

batch_playlist_jobs is planned through the shared playlist engine; dry_run defaults true.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_id`        | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |
| `percentage`         | unknown |      yes | —       |
| `target_duration_ms` | unknown |      yes | —       |

## `build_session_queue`

**Title:** Build session queue

**Type:** Read

Read-only deterministic queue plan from a playlist; never writes Spotify queue.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `playlist_id`             | unknown |      yes | —       |
| `max_tracks`              | unknown |      yes | —       |
| `target_duration_minutes` | unknown |      yes | —       |
| `min_artist_gap`          | unknown |      yes | —       |
| `seed`                    | unknown |      yes | —       |

## `bulk_add_tracks`

**Title:** Bulk add tracks

**Type:** Write / action

Add mixed ID/URI/search track inputs in ordered chunks; supports strict, dry_run and skip_existing.

**Arguments:**

| Argument        | Type    | Required | Details |
| --------------- | ------- | -------: | ------- |
| `playlist_id`   | unknown |      yes | —       |
| `tracks`        | unknown |      yes | —       |
| `strict`        | unknown |      yes | —       |
| `dry_run`       | unknown |      yes | —       |
| `skip_existing` | unknown |      yes | —       |

## `bulk_edit_playlists`

**Type:** Write / action

bulk_edit_playlists is planned through the shared playlist engine; dry_run defaults true.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_id`        | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |
| `percentage`         | unknown |      yes | —       |
| `target_duration_ms` | unknown |      yes | —       |

## `cancel_job`

**Title:** Cancel job

**Type:** Write / action

Cancel a durable job without deleting its history.

**Arguments:**

| Argument | Type    | Required | Details |
| -------- | ------- | -------: | ------- |
| `job_id` | unknown |      yes | —       |

## `chapterize_playlist`

**Title:** Chapterize playlist

**Type:** Read

Analyze the existing playlist order into deterministic narrative chapters. Read-only for Spotify.

**Arguments:**

| Argument                 | Type    | Required | Details |
| ------------------------ | ------- | -------: | ------- |
| `playlist_id`            | unknown |      yes | —       |
| `style`                  | unknown |      yes | —       |
| `target_chapter_minutes` | unknown |      yes | —       |
| `min_chapter_minutes`    | unknown |      yes | —       |
| `max_chapter_minutes`    | unknown |      yes | —       |
| `chapter_count`          | unknown |      yes | —       |
| `regenerate_titles`      | unknown |      yes | —       |
| `save`                   | unknown |      yes | —       |

## `check_saved_tracks`

**Title:** Check saved tracks

**Type:** Read

Return an exact input-to-saved mapping using current /me/library/contains.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `track_ids`               | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `clone_playlist`

**Title:** Clone playlist

**Type:** Write / action

Clone ordered playlist content; dry_run defaults true and never creates a playlist.

**Arguments:**

| Argument              | Type    | Required | Details |
| --------------------- | ------- | -------: | ------- |
| `playlist_id`         | unknown |      yes | —       |
| `new_name`            | unknown |      yes | —       |
| `include_description` | unknown |      yes | —       |
| `dry_run`             | unknown |      yes | —       |

## `commit_job`

**Title:** Commit job

**Type:** Write / action

Commit a ready durable job with ordered, chunked Spotify writes.

**Arguments:**

| Argument | Type    | Required | Details |
| -------- | ------- | -------: | ------- |
| `job_id` | unknown |      yes | —       |

## `compare_playlists`

**Title:** Compare playlists

**Type:** Read

Read-only efficient URI, artist, album and duration comparison.

**Arguments:**

| Argument        | Type    | Required | Details |
| --------------- | ------- | -------: | ------- |
| `playlist_id_a` | unknown |      yes | —       |
| `playlist_id_b` | unknown |      yes | —       |

## `complete_artist_collection`

**Type:** Read

Read-only local-first personalization operation with explicit evidence and no automatic provider mutation.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `limit`       | unknown |      yes | —       |

## `create_bulk_job`

**Title:** Create bulk job

**Type:** Write / action

Persist a bulk track operation for later processing.

**Arguments:**

| Argument       | Type    | Required | Details |
| -------------- | ------- | -------: | ------- |
| `type`         | unknown |      yes | —       |
| `payload`      | unknown |      yes | —       |
| `items`        | unknown |      yes | —       |
| `max_attempts` | unknown |      yes | —       |

## `create_playlist`

**Title:** Create playlist

**Type:** Write / action

Create a playlist; collaborative playlists must be private.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `name`                    | unknown |      yes | —       |
| `description`             | unknown |      yes | —       |
| `public`                  | unknown |      yes | —       |
| `collaborative`           | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |

## `create_playlist_from_tracks`

**Title:** Create playlist from tracks

**Type:** Write / action

Resolves all tracks before creation in strict mode, then creates and inserts sequential chunks.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `name`                    | unknown |      yes | —       |
| `description`             | unknown |      yes | —       |
| `public`                  | unknown |      yes | —       |
| `tracks`                  | unknown |      yes | —       |
| `strict`                  | unknown |      yes | —       |
| `skip_duplicates`         | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |

## `deduplicate_playlist`

**Title:** Deduplicate playlist

**Type:** Write / action
**Destructive hint:** yes

Fetches all items, preserves first occurrence and order, and refuses lossless reconstruction when unsupported items exist.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `dry_run`     | unknown |      yes | —       |

## `deep_cuts_mode`

**Type:** Read

Read-only local-first personalization operation with explicit evidence and no automatic provider mutation.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `limit`       | unknown |      yes | —       |

## `dry_run_playlist_operation`

**Title:** Dry run playlist operation

**Type:** Read

Read-only planner for supported smart playlist operations; performs zero Spotify writes.

**Arguments:**

| Argument           | Type    | Required | Details |
| ------------------ | ------- | -------: | ------- |
| `playlist_id`      | unknown |      yes | —       |
| `operation`        | unknown |      yes | —       |
| `max_artist_share` | unknown |      yes | —       |
| `min_artist_gap`   | unknown |      yes | —       |
| `min_album_gap`    | unknown |      yes | —       |
| `seed`             | unknown |      yes | —       |

## `estimate_operation_cost`

**Title:** Estimate operation cost

**Type:** Read

Read-only conservative Spotify API request estimate; no financial pricing.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `operation`   | unknown |      yes | —       |
| `track_count` | unknown |      yes | —       |

## `execute_playlist_transfer`

**Title:** Execute playlist transfer

**Type:** Write / action
**Destructive hint:** yes

Execute a previously validated transfer plan against the explicitly selected destination. Requires confirmation and verifies the resulting playlist.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `transfer_plan`           | unknown |      yes | —       |
| `destination_playlist_id` | unknown |      yes | —       |
| `confirm`                 | unknown |      yes | —       |
| `resumed`                 | unknown |      yes | —       |

## `export_playlist`

**Title:** Export playlist

**Type:** Read

Export provider-neutral canonical playlist data without credentials or provider calls.

**Arguments:**

| Argument   | Type    | Required | Details |
| ---------- | ------- | -------: | ------- |
| `format`   | unknown |      yes | —       |
| `playlist` | unknown |      yes | —       |

## `extend_playlist_to_duration`

**Title:** Extend playlist to duration

**Type:** Write / action

Resolve a local candidate pool, append only needed tracks, snapshot and verify.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_id`        | unknown |      yes | —       |
| `target_duration_ms` | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |
| `candidate_limit`    | unknown |      yes | —       |
| `min_artist_gap`     | unknown |      yes | —       |
| `seed`               | unknown |      yes | —       |

## `extract_artist_tracks`

**Type:** Write / action

extract_artist_tracks using playlist metadata; dry_run defaults true.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `artist_id`   | unknown |      yes | —       |
| `artist_name` | unknown |      yes | —       |
| `dry_run`     | unknown |      yes | —       |

## `filter_playlist`

**Title:** Filter playlist

**Type:** Write / action

Filter by typed deterministic predicates; dry_run defaults true.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `filters`     | unknown |      yes | —       |
| `mode`        | unknown |      yes | —       |
| `dry_run`     | unknown |      yes | —       |

## `find_missing_favorites`

**Type:** Read

Read-only local-first personalization operation with explicit evidence and no automatic provider mutation.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `limit`       | unknown |      yes | —       |

## `find_playlist_by_name`

**Title:** Find playlist by name

**Type:** Read

Find all current-user playlists matching a normalized name across all pages.

**Arguments:**

| Argument | Type    | Required | Details |
| -------- | ------- | -------: | ------- |
| `name`   | unknown |      yes | —       |

## `find_track_exact`

**Title:** Find track exactly

**Type:** Read

Resolve a track by deterministic title/artist/album/year scoring; returns matched, ambiguous, or unmatched.

**Arguments:**

| Argument | Type   | Required | Details |
| -------- | ------ | -------: | ------- |
| `title`  | string |      yes | —       |
| `artist` | string |      yes | —       |
| `album`  | string |       no | —       |
| `year`   | number |       no | —       |

## `freshen_playlist`

**Type:** Write / action

freshen_playlist is planned through the shared playlist engine; dry_run defaults true.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_id`        | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |
| `percentage`         | unknown |      yes | —       |
| `target_duration_ms` | unknown |      yes | —       |

## `generate_daily_mix`

**Type:** Write / action

generate_daily_mix remains local-first and dry-run by default; no unsupported Spotify behavior is assumed.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_id`        | unknown |      yes | —       |
| `target_playlist_id` | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |

## `generate_weekly_rotation`

**Type:** Write / action

generate_weekly_rotation remains local-first and dry-run by default; no unsupported Spotify behavior is assumed.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_id`        | unknown |      yes | —       |
| `target_playlist_id` | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |

## `get_artist`

**Type:** Read

Get a provider artist by ID, URI, or URL.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `artist_id`               | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `get_artist_top_tracks`

**Title:** Get artist top tracks

**Type:** Write / action

Spotify removed the official endpoint in February 2026; this tool returns a structured platform limitation.

**Arguments:**

| Argument    | Type    | Required | Details |
| ----------- | ------- | -------: | ------- |
| `artist_id` | unknown |      yes | —       |

## `get_capabilities`

**Title:** Get provider capabilities

**Type:** Read

Describe supported provider operations and explain unavailable capabilities.

**Arguments:**

| Argument        | Type    | Required | Details |
| --------------- | ------- | -------: | ------- |
| `provider`      | unknown |      yes | —       |
| `connection_id` | unknown |      yes | —       |

## `get_connections`

**Title:** Get provider connections

**Type:** Read

List compact provider connection summaries without credentials.

**Arguments:**

- None

## `get_currently_playing`

**Title:** Get currently playing

**Type:** Read

Get the currently playing track or episode; 204 is returned as inactive playback.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

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

| Argument | Type    | Required | Details |
| -------- | ------- | -------: | ------- |
| `job_id` | unknown |      yes | —       |
| `offset` | unknown |      yes | —       |
| `limit`  | unknown |      yes | —       |

## `get_my_playlists`

**Title:** Get my playlists

**Type:** Read

List compact playlists; all=true fetches all pages up to the server safety cap.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `limit`                   | unknown |      yes | —       |
| `offset`                  | unknown |      yes | —       |
| `all`                     | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `get_playback_state`

**Title:** Get playback state

**Type:** Read

Get playback state and normalize either a track or episode item.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `get_playlist`

**Title:** Get playlist

**Type:** Read

Get playlist metadata.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `playlist_id`             | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `get_playlist_chapters`

**Title:** Get playlist chapters

**Type:** Read

Read the latest saved chapter set and report whether the playlist order has changed.

**Arguments:**

| Argument         | Type    | Required | Details |
| ---------------- | ------- | -------: | ------- |
| `playlist_id`    | unknown |      yes | —       |
| `chapter_set_id` | unknown |      yes | —       |

## `get_playlist_stats`

**Title:** Get playlist stats

**Type:** Read

Fetches all playlist items and computes local aggregates.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |

## `get_playlist_tracks`

**Title:** Get playlist items

**Type:** Read

Read normalized playlist items using current /items; maximum page size is 50.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `playlist_id`             | unknown |      yes | —       |
| `limit`                   | unknown |      yes | —       |
| `offset`                  | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `get_rate_limit_status`

**Title:** Get rate limit status

**Type:** Read

Inspect persisted provider rate-limit scopes.

**Arguments:**

| Argument        | Type    | Required | Details |
| --------------- | ------- | -------: | ------- |
| `provider`      | unknown |      yes | —       |
| `scope`         | unknown |      yes | —       |
| `connection_id` | unknown |      yes | —       |

## `get_recent_api_errors`

**Title:** Get recent API errors

**Type:** Read

Inspect bounded, normalized API error history.

**Arguments:**

| Argument          | Type    | Required | Details |
| ----------------- | ------- | -------: | ------- |
| `limit`           | unknown |      yes | —       |
| `provider`        | unknown |      yes | —       |
| `status_code`     | unknown |      yes | —       |
| `unresolved_only` | unknown |      yes | —       |
| `connection_id`   | unknown |      yes | —       |

## `get_recently_played`

**Title:** Get recently played

**Type:** Read

Read recent history; before and after cannot be combined.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `limit`                   | unknown |      yes | —       |
| `before`                  | unknown |      yes | —       |
| `after`                   | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `get_saved_tracks`

**Title:** Get saved tracks

**Type:** Read

Read saved tracks with pagination.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `limit`                   | unknown |      yes | —       |
| `offset`                  | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `get_state_diagnostics`

**Title:** Get State DB diagnostics

**Type:** Read

Return authenticated, bounded State DB health counters.

**Arguments:**

| Argument        | Type    | Required | Details |
| --------------- | ------- | -------: | ------- |
| `provider`      | unknown |      yes | —       |
| `connection_id` | unknown |      yes | —       |

## `get_top_artists`

**Type:** Read

Read personalized top Spotify items; Spotify maximum is 50.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `time_range`              | unknown |      yes | —       |
| `limit`                   | unknown |      yes | —       |
| `offset`                  | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `get_top_tracks`

**Type:** Read

Read personalized top Spotify items; Spotify maximum is 50.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `time_range`              | unknown |      yes | —       |
| `limit`                   | unknown |      yes | —       |
| `offset`                  | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `get_track`

**Type:** Read

Get a provider track by ID, URI, or URL.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `track_id`                | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `import_playlist`

**Title:** Import playlist

**Type:** Write / action

Parse and validate provider-neutral playlist data. This operation never writes to a provider.

**Arguments:**

| Argument  | Type    | Required | Details |
| --------- | ------- | -------: | ------- |
| `format`  | unknown |      yes | —       |
| `content` | unknown |      yes | —       |

## `inbox_playlist`

**Type:** Write / action

inbox_playlist remains local-first and dry-run by default; no unsupported Spotify behavior is assumed.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_id`        | unknown |      yes | —       |
| `target_playlist_id` | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |

## `liked_to_playlist_sync`

**Type:** Write / action
**Destructive hint:** yes

liked_to_playlist_sync remains local-first and dry-run by default; no unsupported Spotify behavior is assumed.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_id`        | unknown |      yes | —       |
| `target_playlist_id` | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |

## `limit_artist_share`

**Title:** Limit artist share

**Type:** Write / action
**Destructive hint:** yes

Plan or execute deterministic artist-share removals; dry_run defaults true.

**Arguments:**

| Argument                | Type    | Required | Details |
| ----------------------- | ------- | -------: | ------- |
| `playlist_id`           | unknown |      yes | —       |
| `dry_run`               | unknown |      yes | —       |
| `max_share`             | unknown |      yes | —       |
| `max_tracks_per_artist` | unknown |      yes | —       |
| `selection_strategy`    | unknown |      yes | —       |

## `list_jobs`

**Title:** List jobs

**Type:** Read

List bounded durable job summaries.

**Arguments:**

| Argument | Type    | Required | Details |
| -------- | ------- | -------: | ------- |
| `offset` | unknown |      yes | —       |
| `limit`  | unknown |      yes | —       |

## `merge_playlists_smart`

**Title:** Smart merge playlists

**Type:** Write / action

Merge source playlists without mutating them; dry_run defaults true.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_ids`       | unknown |      yes | —       |
| `target_playlist_id` | unknown |      yes | —       |
| `new_playlist_name`  | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |
| `deduplicate`        | unknown |      yes | —       |
| `balance_artists`    | unknown |      yes | —       |
| `seed`               | unknown |      yes | —       |

## `move_artist_tracks`

**Type:** Write / action

move_artist_tracks using playlist metadata; dry_run defaults true.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `artist_id`   | unknown |      yes | —       |
| `artist_name` | unknown |      yes | —       |
| `dry_run`     | unknown |      yes | —       |

## `next_track`

**Type:** Write / action

Control Spotify playback.

**Arguments:**

| Argument    | Type    | Required | Details |
| ----------- | ------- | -------: | ------- |
| `device_id` | unknown |      yes | —       |

## `optimize_playlist`

**Title:** Optimize playlist

**Type:** Write / action
**Destructive hint:** yes

Meta-tool composing deterministic playlist primitives; dry_run defaults true and does not snapshot.

**Arguments:**

| Argument               | Type    | Required | Details |
| ---------------------- | ------- | -------: | ------- |
| `playlist_id`          | unknown |      yes | —       |
| `dry_run`              | unknown |      yes | —       |
| `semantic_deduplicate` | unknown |      yes | —       |
| `smart_shuffle`        | unknown |      yes | —       |
| `balance_artists`      | unknown |      yes | —       |
| `max_artist_share`     | unknown |      yes | —       |
| `min_artist_gap`       | unknown |      yes | —       |
| `min_album_gap`        | unknown |      yes | —       |
| `seed`                 | unknown |      yes | —       |

## `pause`

**Type:** Write / action

Pause Spotify playback; verifies the resulting state after a 403 restriction response.

**Arguments:**

| Argument    | Type    | Required | Details |
| ----------- | ------- | -------: | ------- |
| `device_id` | unknown |      yes | —       |

## `personalize_playlist`

**Title:** Personalize playlist

**Type:** Write / action

Deterministic local personalization combining affinity and artist spacing; dry_run defaults true.

**Arguments:**

| Argument                | Type    | Required | Details |
| ----------------------- | ------- | -------: | ------- |
| `playlist_id`           | unknown |      yes | —       |
| `dry_run`               | unknown |      yes | —       |
| `affinity_weight`       | unknown |      yes | —       |
| `freshness_weight`      | unknown |      yes | —       |
| `rediscovery_weight`    | unknown |      yes | —       |
| `artist_balance_weight` | unknown |      yes | —       |
| `min_artist_gap`        | unknown |      yes | —       |
| `seed`                  | unknown |      yes | —       |

## `plan_playlist_transfer`

**Title:** Plan playlist transfer

**Type:** Read

Create an explainable cross-provider transfer plan. Dry-run only; performs zero destination writes.

**Arguments:**

| Argument                    | Type    | Required | Details |
| --------------------------- | ------- | -------: | ------- |
| `source_connection_id`      | unknown |      yes | —       |
| `source_playlist_id`        | unknown |      yes | —       |
| `destination_connection_id` | unknown |      yes | —       |
| `destination_provider`      | unknown |      yes | —       |
| `start_position`            | unknown |      yes | —       |
| `max_tracks`                | unknown |      yes | —       |

## `play`

**Title:** Play

**Type:** Write / action

Start or resume playback; context_uri and uris are mutually exclusive. Verifies the resulting state after a 403 restriction response.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `device_id`   | unknown |      yes | —       |
| `context_uri` | unknown |      yes | —       |
| `uris`        | unknown |      yes | —       |
| `offset`      | unknown |      yes | —       |
| `position_ms` | unknown |      yes | —       |

## `play_playlist_chapter`

**Title:** Play playlist chapter

**Type:** Write / action

Start Spotify playback at a chapter offset; playback may continue after the chapter ends.

**Arguments:**

| Argument         | Type    | Required | Details |
| ---------------- | ------- | -------: | ------- |
| `playlist_id`    | unknown |      yes | —       |
| `chapter_set_id` | unknown |      yes | —       |
| `chapter_number` | unknown |      yes | —       |
| `device_id`      | unknown |      yes | —       |

## `playlist_diff`

**Title:** Playlist diff

**Type:** Read

Read-only linear diff between a playlist and a durable snapshot.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `snapshot_id` | unknown |      yes | —       |

## `playlist_health_report`

**Title:** Playlist health report

**Type:** Read

Read-only deterministic playlist health analysis; never mutates a provider.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |

## `playlist_recipe`

**Title:** Playlist recipe

**Type:** Write / action

Create, read, list, update or delete a persistent versioned playlist recipe.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `action`      | unknown |      yes | —       |
| `recipe_id`   | unknown |      yes | —       |
| `name`        | unknown |      yes | —       |
| `description` | unknown |      yes | —       |
| `rules`       | unknown |      yes | —       |
| `operations`  | unknown |      yes | —       |

## `playlist_rules_engine`

**Title:** Playlist rules engine

**Type:** Read

Read-only deterministic rule evaluation; never mutates Spotify.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `rules`       | unknown |      yes | —       |
| `dry_run`     | unknown |      yes | —       |

## `playlist_skip_cleanup`

**Type:** Write / action
**Destructive hint:** yes

playlist_skip_cleanup remains local-first and dry-run by default; no unsupported Spotify behavior is assumed.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_id`        | unknown |      yes | —       |
| `target_playlist_id` | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |

## `playlist_trim_to_duration`

**Title:** Trim playlist to duration

**Type:** Write / action

Plan or trim a playlist without exceeding the target; dry_run defaults true.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_id`        | unknown |      yes | —       |
| `target_duration_ms` | unknown |      yes | —       |
| `target_minutes`     | unknown |      yes | —       |
| `strategy`           | unknown |      yes | —       |
| `seed`               | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |

## `playlist_versioning`

**Type:** Write / action
**Destructive hint:** yes

Read-only local-first personalization operation with explicit evidence and no automatic provider mutation.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `limit`       | unknown |      yes | —       |

## `preview_playlist_import`

**Title:** Preview playlist import

**Type:** Write / action

Parse and validate provider-neutral playlist data. This operation never writes to a provider.

**Arguments:**

| Argument  | Type    | Required | Details |
| --------- | ------- | -------: | ------- |
| `format`  | unknown |      yes | —       |
| `content` | unknown |      yes | —       |

## `previous_track`

**Type:** Write / action

Control Spotify playback.

**Arguments:**

| Argument    | Type    | Required | Details |
| ----------- | ------- | -------: | ------- |
| `device_id` | unknown |      yes | —       |

## `queue_from_playlist`

**Type:** Write / action

Read-only local-first personalization operation with explicit evidence and no automatic provider mutation.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `limit`       | unknown |      yes | —       |

## `rank_playlist_tracks`

**Title:** Rank playlist tracks

**Type:** Read

Read-only explainable local affinity/freshness ranking; no Spotify popularity fallback.

**Arguments:**

| Argument       | Type    | Required | Details |
| -------------- | ------- | -------: | ------- |
| `playlist_id`  | unknown |      yes | —       |
| `ranking_mode` | unknown |      yes | —       |

## `rediscover_old_tracks`

**Type:** Read

Read-only local-first personalization operation with explicit evidence and no automatic provider mutation.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `limit`       | unknown |      yes | —       |

## `remember_track`

**Title:** Remember track

**Type:** Read

Verify a known Spotify track ID, URI, or public URL and save its safe alias.

**Arguments:**

| Argument        | Type    | Required | Details |
| --------------- | ------- | -------: | ------- |
| `track_id`      | unknown |      yes | —       |
| `title`         | unknown |      yes | —       |
| `artist`        | unknown |      yes | —       |
| `album`         | unknown |      yes | —       |
| `provider`      | unknown |      yes | —       |
| `connection_id` | unknown |      yes | —       |

## `remove_artist_from_playlist`

**Type:** Write / action

remove_artist_from_playlist using playlist metadata; dry_run defaults true.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `artist_id`   | unknown |      yes | —       |
| `artist_name` | unknown |      yes | —       |
| `dry_run`     | unknown |      yes | —       |

## `remove_saved_tracks`

**Type:** Write / action
**Destructive hint:** yes

Save or remove tracks using current /me/library endpoint in chunks of 40.

**Arguments:**

| Argument    | Type    | Required | Details |
| ----------- | ------- | -------: | ------- |
| `track_ids` | unknown |      yes | —       |

## `remove_tracks_from_playlist`

**Title:** Remove playlist items

**Type:** Write / action
**Destructive hint:** yes

Remove requested URI occurrences using DELETE /items and return the final snapshot.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `playlist_id`             | unknown |      yes | —       |
| `track_ids`               | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |

## `reorder_playlist_tracks`

**Title:** Reorder playlist items

**Type:** Write / action

Reorder with current PUT /items payload.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `playlist_id`             | unknown |      yes | —       |
| `range_start`             | unknown |      yes | —       |
| `insert_before`           | unknown |      yes | —       |
| `range_length`            | unknown |      yes | —       |
| `snapshot_id`             | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |

## `replace_artist_tracks`

**Type:** Write / action

replace_artist_tracks using playlist metadata; dry_run defaults true.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `artist_id`   | unknown |      yes | —       |
| `artist_name` | unknown |      yes | —       |
| `dry_run`     | unknown |      yes | —       |

## `replace_percentage`

**Type:** Write / action

replace_percentage is planned through the shared playlist engine; dry_run defaults true.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_id`        | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |
| `percentage`         | unknown |      yes | —       |
| `target_duration_ms` | unknown |      yes | —       |

## `replace_playlist_tracks`

**Title:** Replace playlist items

**Type:** Write / action
**Destructive hint:** yes

Replace then append ordered chunks, max 100 per request; rolls back after later chunk failure.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `playlist_id`             | unknown |      yes | —       |
| `track_ids`               | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |

## `restore_playlist_snapshot`

**Title:** Restore playlist snapshot

**Type:** Write / action
**Destructive hint:** yes

Restore exact ordered content from a durable snapshot; creates a PRE-RESTORE safety snapshot.

**Arguments:**

| Argument        | Type    | Required | Details |
| --------------- | ------- | -------: | ------- |
| `snapshot_id`   | unknown |      yes | —       |
| `dry_run`       | unknown |      yes | —       |
| `connection_id` | unknown |      yes | —       |
| `provider`      | unknown |      yes | —       |

## `resume_job`

**Title:** Resume job

**Type:** Write / action

Make a durable job eligible for processing.

**Arguments:**

| Argument | Type    | Required | Details |
| -------- | ------- | -------: | ------- |
| `job_id` | unknown |      yes | —       |

## `resume_playlist_chapter`

**Title:** Resume playlist chapter

**Type:** Write / action

Resume a previously started chapter from its first saved position.

**Arguments:**

| Argument         | Type    | Required | Details |
| ---------------- | ------- | -------: | ------- |
| `playlist_id`    | unknown |      yes | —       |
| `chapter_set_id` | unknown |      yes | —       |
| `chapter_number` | unknown |      yes | —       |
| `device_id`      | unknown |      yes | —       |

## `rotation_manager`

**Type:** Write / action

rotation_manager remains local-first and dry-run by default; no unsupported Spotify behavior is assumed.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `playlist_id`        | unknown |      yes | —       |
| `target_playlist_id` | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |

## `save_tracks`

**Type:** Write / action

Save or remove tracks using current /me/library endpoint in chunks of 40.

**Arguments:**

| Argument    | Type    | Required | Details |
| ----------- | ------- | -------: | ------- |
| `track_ids` | unknown |      yes | —       |

## `search_albums`

**Type:** Read

Search the selected provider catalog with current pagination.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `query`                   | unknown |      yes | —       |
| `limit`                   | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `search_artists`

**Type:** Read

Search the selected provider catalog with current pagination.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `query`                   | unknown |      yes | —       |
| `limit`                   | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `search_tracks`

**Type:** Read

Search the selected provider catalog with current pagination.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `query`                   | unknown |      yes | —       |
| `limit`                   | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |
| `read_fallback`           | unknown |      yes | —       |

## `seek`

**Title:** Seek

**Type:** Write / action

Seek to a non-negative position.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `position_ms` | unknown |      yes | —       |
| `device_id`   | unknown |      yes | —       |

## `semantic_deduplicate_playlist`

**Title:** Semantic deduplicate playlist

**Type:** Write / action
**Destructive hint:** yes

Conservative deterministic deduplication. dry_run defaults true; execution snapshots and verifies.

**Arguments:**

| Argument                | Type    | Required | Details |
| ----------------------- | ------- | -------: | ------- |
| `playlist_id`           | unknown |      yes | —       |
| `dry_run`               | unknown |      yes | —       |
| `prefer_original`       | unknown |      yes | —       |
| `remove_remasters`      | unknown |      yes | —       |
| `remove_live`           | unknown |      yes | —       |
| `remove_remixes`        | unknown |      yes | —       |
| `remove_sped_up`        | unknown |      yes | —       |
| `remove_slowed`         | unknown |      yes | —       |
| `duration_tolerance_ms` | unknown |      yes | —       |

## `session_history`

**Title:** Session history

**Type:** Read

Read locally observed playback history with provenance; does not claim complete Spotify history.

**Arguments:**

| Argument | Type    | Required | Details |
| -------- | ------- | -------: | ------- |
| `since`  | unknown |      yes | —       |
| `until`  | unknown |      yes | —       |
| `limit`  | unknown |      yes | —       |
| `artist` | unknown |      yes | —       |
| `track`  | unknown |      yes | —       |
| `source` | unknown |      yes | —       |

## `set_volume`

**Title:** Set volume

**Type:** Write / action

Set volume from 0 to 100.

**Arguments:**

| Argument         | Type    | Required | Details |
| ---------------- | ------- | -------: | ------- |
| `volume_percent` | unknown |      yes | —       |
| `device_id`      | unknown |      yes | —       |

## `skip_pattern_report`

**Type:** Read

Read-only local-first personalization operation with explicit evidence and no automatic provider mutation.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `limit`       | unknown |      yes | —       |

## `smart_insert_tracks`

**Title:** Smart insert tracks

**Type:** Write / action
**Destructive hint:** yes

Insert tracks at deterministic distributed positions; dry_run defaults true.

**Arguments:**

| Argument         | Type    | Required | Details |
| ---------------- | ------- | -------: | ------- |
| `playlist_id`    | unknown |      yes | —       |
| `dry_run`        | unknown |      yes | —       |
| `track_ids`      | unknown |      yes | —       |
| `min_artist_gap` | unknown |      yes | —       |
| `min_album_gap`  | unknown |      yes | —       |
| `seed`           | unknown |      yes | —       |

## `smart_next`

**Title:** Smart next

**Type:** Read

Selects from a supplied playlist using local evidence; does not start playback.

**Arguments:**

| Argument         | Type    | Required | Details |
| ---------------- | ------- | -------: | ------- |
| `playlist_id`    | unknown |      yes | —       |
| `min_artist_gap` | unknown |      yes | —       |
| `seed`           | unknown |      yes | —       |

## `smart_shuffle_playlist`

**Title:** Smart shuffle playlist

**Type:** Write / action
**Destructive hint:** yes

Deterministic seeded spacing layout; dry_run defaults true.

**Arguments:**

| Argument           | Type    | Required | Details |
| ------------------ | ------- | -------: | ------- |
| `playlist_id`      | unknown |      yes | —       |
| `dry_run`          | unknown |      yes | —       |
| `min_artist_gap`   | unknown |      yes | —       |
| `min_album_gap`    | unknown |      yes | —       |
| `seed`             | unknown |      yes | —       |
| `preserve_first_n` | unknown |      yes | —       |
| `preserve_last_n`  | unknown |      yes | —       |

## `snapshot_playlist`

**Title:** Snapshot playlist

**Type:** Write / action

Persist an ordered playlist snapshot; requires the state database.

**Arguments:**

| Argument      | Type    | Required | Details |
| ------------- | ------- | -------: | ------- |
| `playlist_id` | unknown |      yes | —       |
| `reason`      | unknown |      yes | —       |

## `sort_by_personal_affinity`

**Title:** Sort by personal affinity

**Type:** Write / action

Plan or reorder using local evidence only; dry_run defaults true and snapshots on execution.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `playlist_id`             | unknown |      yes | —       |
| `direction`               | unknown |      yes | —       |
| `dry_run`                 | unknown |      yes | —       |
| `preserve_artist_spacing` | unknown |      yes | —       |
| `min_artist_gap`          | unknown |      yes | —       |

## `split_playlist_balanced`

**Title:** Split playlist

**Type:** Write / action

Split a playlist into deterministic groups; dry_run defaults true.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `playlist_id`             | unknown |      yes | —       |
| `parts`                   | unknown |      yes | —       |
| `max_tracks_per_playlist` | unknown |      yes | —       |
| `strategy`                | unknown |      yes | —       |
| `dry_run`                 | unknown |      yes | —       |
| `output_name_template`    | unknown |      yes | —       |

## `sync_playlist_transfer`

**Title:** Synchronize transferred playlist

**Type:** Write / action
**Destructive hint:** yes

Apply an explicitly confirmed provider-neutral sync policy. Destructive cross-provider conflicts fail closed.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `transfer_plan`           | unknown |      yes | —       |
| `destination_playlist_id` | unknown |      yes | —       |
| `policy`                  | unknown |      yes | —       |
| `confirm`                 | unknown |      yes | —       |

## `sync_playlists`

**Title:** Sync playlists

**Type:** Write / action

Plan or apply deterministic playlist synchronization; dry_run defaults true.

**Arguments:**

| Argument             | Type    | Required | Details |
| -------------------- | ------- | -------: | ------- |
| `source_playlist_id` | unknown |      yes | —       |
| `target_playlist_id` | unknown |      yes | —       |
| `mode`               | unknown |      yes | —       |
| `dry_run`            | unknown |      yes | —       |

## `transfer_playback`

**Title:** Transfer playback

**Type:** Write / action

Transfer playback to a Spotify Connect device.

**Arguments:**

| Argument    | Type    | Required | Details |
| ----------- | ------- | -------: | ------- |
| `device_id` | unknown |      yes | —       |
| `play`      | unknown |      yes | —       |

## `undo_last_playlist_change`

**Title:** Undo last playlist change

**Type:** Write / action
**Destructive hint:** yes

Restore the latest completed JamRelay-managed reversible operation only; dry_run defaults true.

**Arguments:**

| Argument        | Type    | Required | Details |
| --------------- | ------- | -------: | ------- |
| `playlist_id`   | unknown |      yes | —       |
| `dry_run`       | unknown |      yes | —       |
| `connection_id` | unknown |      yes | —       |
| `provider`      | unknown |      yes | —       |

## `update_playlist_details`

**Title:** Update playlist details

**Type:** Write / action

Update playlist metadata; collaborative playlists must be private.

**Arguments:**

| Argument                  | Type    | Required | Details |
| ------------------------- | ------- | -------: | ------- |
| `playlist_id`             | unknown |      yes | —       |
| `name`                    | unknown |      yes | —       |
| `description`             | unknown |      yes | —       |
| `public`                  | unknown |      yes | —       |
| `collaborative`           | unknown |      yes | —       |
| `connection_id`           | unknown |      yes | —       |
| `provider`                | unknown |      yes | —       |
| `preferred_connection_id` | unknown |      yes | —       |

## `verify_playlist_integrity`

**Title:** Verify playlist integrity

**Type:** Read

Read-only verification of playlist readability, count, content and optional snapshot state.

**Arguments:**

| Argument               | Type    | Required | Details |
| ---------------------- | ------- | -------: | ------- |
| `playlist_id`          | unknown |      yes | —       |
| `expected_snapshot_id` | unknown |      yes | —       |
| `operation_plan_id`    | unknown |      yes | —       |
