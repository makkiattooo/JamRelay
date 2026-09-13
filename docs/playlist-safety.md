---
title: Playlist safety, snapshots and undo
description: The safety lifecycle for JamRelay playlist mutations.
---

# Playlist safety, snapshots and undo

Mutating playlist operations are designed around:

`ANALYZE → PLAN → DRY RUN → SNAPSHOT → EXECUTE → VERIFY → RECORD`

Dry-run is the default for smart playlist operations. A mutation snapshot stores ordered URIs, playlist metadata, Spotify snapshot ID when available, and the originating operation. Verification checks the resulting playlist after writes. Undo restores the latest completed JamRelay-managed reversible operation; it cannot undo arbitrary changes made elsewhere in Spotify.

Spotify writes are not a cross-request ACID transaction. Chunk failures can produce a partial result, which is reported explicitly with safety snapshot information. No operation claims rollback success unless the resulting state was verified.
