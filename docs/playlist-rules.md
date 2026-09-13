---
title: Playlist rules and recipes
description: Deterministic rules and persistent playlist recipes in JamRelay.
---

# Playlist rules and recipes

The rules engine evaluates artist, album, track and playlist constraints without mutating Spotify. Results include passed rules, violations, involved tracks and correction hints.

Recipes store a named set of rules and transformations in SQLite with a version number. Applying a recipe records the resolved definition used for the operation, so later recipe edits do not change historical meaning. Dry-run returns a composed plan; execution snapshots once and verifies the final state.

Example request:

> Apply my balanced daily playlist recipe as a dry run, keeping at least five tracks between the same artist.

Relevant tools include `playlist_rules_engine`, `playlist_recipe` and `apply_playlist_recipe`.
