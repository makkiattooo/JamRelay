# Playlist chapters

JamRelay can analyze an existing playlist into ordered, contiguous chapters. Chapterization is a local analysis of the playlist response: it does not reorder tracks, create a second playlist, or write to the provider.

## Tools

- `chapterize_playlist` fetches the playlist once, analyzes its available track metadata, and optionally saves a chapter set. `style` can be `narrative`, `balanced`, `energy`, or `album_like`; target duration, track bounds, and an explicit chapter count are supported.
- `get_playlist_chapters` returns the saved set and checks the current playlist fingerprint. A changed order, URI, or membership marks the set `stale`.
- `play_playlist_chapter` starts Spotify playback with the playlist context URI and the chapter start offset. Spotify controls the queue, so playback may continue into the next chapter; JamRelay does not pretend to enforce an end boundary.
- `resume_playlist_chapter` starts the selected chapter again and records progress. It is intentionally conservative because provider playback state does not guarantee that a chapter boundary was reached.

## Analysis and persistence

The engine scores candidate boundaries using local artist and album transitions, title-word continuity, duration contrast, nearby-window continuity, and the selected style. A deterministic dynamic-programming partition then chooses contiguous segments subject to track-count and duration preferences. Titles and summaries are deterministic heuristic labels, not generated claims about the music.

Saved sets are versioned and include the playlist snapshot identifier, ordered content fingerprint, options, chapters, boundary evidence, and progress rows. A stale set remains readable for audit, but playback is only an offset into the current provider playlist and should be regenerated when the order or membership has changed.

Chapterization does not call per-track catalog endpoints when playlist metadata already contains the required fields. Missing/unavailable playlist items are excluded from analysis and are not silently represented as playable chapters.
