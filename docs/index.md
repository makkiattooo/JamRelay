---
title: JamRelay — self-hosted music automation
description: Automate Spotify playlists and playback from MCP clients with local state, safe plans and reversible changes.
layout: home
hero:
  name: JamRelay
  text: Music automation you can run yourself.
  tagline: A self-hosted MCP server for Spotify capabilities, playlist automation and explainable local state.
  image:
    src: /brand/jamrelay-icon-256.webp
    alt: JamRelay
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Connect a client
      link: /clients/
features:
  - title: Plan before changing
    details: Dry runs, deterministic plans, snapshots, verification and reversible operations make playlist mutations inspectable.
  - title: Database-first resolution
    details: Known tracks are resolved from the local canonical database before Spotify Search is considered.
  - title: Automation that composes
    details: Rules, recipes, filtering, layout, deduplication, merge, split, sync and bulk workflows share the same engine.
  - title: Self-hosted and local-first
    details: OAuth credentials, state, history and derived signals stay within your deployment by default.
---

## From a request to a safe operation

```mermaid
flowchart LR
  A[MCP client] --> B[Transport and OAuth]
  B --> C[Tool contract]
  C --> D[Domain services and playlist engine]
  D --> E[(SQLite state)]
  D --> F[Spotify API]
```

JamRelay is not Spotify's official Daily Mix or recommendation product. It is a self-hosted automation layer that turns high-level requests into bounded Spotify operations.

## Choose your path

- [Quick start](/getting-started) — connect Spotify and invoke a safe read tool.
- [Playlist automation](/playlist-automation) — analysis, layout, cleanup and composition.
- [Safety model](/playlist-safety) — snapshots, verification and undo guarantees.
- [Database-first resolution](/database-first-resolution) — how local canonical state reduces Search usage.
- [Generated tool reference](/tools-reference) — exact runtime schemas and annotations.

## What JamRelay knows

It can use Spotify responses, local canonical track state, persisted jobs, snapshots and playback/history events that JamRelay actually observed or synchronized. It does not invent dislikes, complete listening history or recommendation preferences. See [personalization limits](/playlist-personalization).
