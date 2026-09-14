---
title: Playlist automation
description: Analysis, cleanup, layout and composition tools for provider playlists.
---

# Playlist automation

JamRelay's playlist engine works on normalized tracks and serializable operation plans. Use health reports and dry runs to inspect a change before applying it.

## Capabilities

- Analysis: concentration, duration, duplicates and artist repetition.
- Layout: seeded smart shuffle, artist balancing and smart insertion.
- Cleanup: exact and conservative semantic deduplication, filtering and artist limits.
- Composition: merge, split, clone and synchronization.
- Automation: typed rules, persistent recipes and optimization.

Provider writes use the selected adapter's current endpoints, pagination and
bounded chunks. Capability differences are surfaced rather than hidden. See
the [generated tool reference](/tools-reference) for exact schemas.
