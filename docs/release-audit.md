---
title: Multi-provider release audit
description: Final audit of the provider-neutral runtime and safe transfer gates.
---

# Multi-provider release audit

## Release-candidate status

Automated release gates are green. This is not a claim that real provider
credentials or third-party MCP clients were manually exercised against this
checkout. The deployment procedure and explicit manual gate are documented in
[Release candidate checklist](/deployment/release-candidate).

This release keeps Spotify as a supported provider and makes `ProviderRegistry` the runtime selection boundary. The MCP surface remains shared across providers; provider-specific tools are not duplicated.

## Verified in repository tests

- zero-provider bootstrap and Spotify-only bootstrap;
- mocked SoundCloud bootstrap and capability-limited adapter behavior;
- mocked Apple Music Developer Token signing, encrypted Music User Token onboarding and capability-limited playlist adapter behavior;
- mocked official YouTube Data API playlist/video requests, OAuth token persistence and quota estimates;
- explicit two-provider read/write routing with fail-closed write selection;
- dry-run transfer planning with ambiguity evidence and zero destination writes;
- confirmed transfer execution with destination snapshots, operation records, resume-safe replacement and post-write verification;
- destructive sync conflict reporting with zero writes;
- migration-from-0004, snapshot/undo compatibility and MCP OAuth regressions.

## Release boundary

Automated tests use fake providers, fixture signing keys and mocked OAuth/MusicKit state. They do not constitute a manual production credential exercise. In particular, SoundCloud production readiness is not claimed until real credentials, redirect configuration, token rotation and the provider's current API behavior have been exercised by an operator. Apple Music production readiness is not claimed until a real Media Services key, Developer Token, MusicKit-issued Music User Token and library playlist flow have been exercised by an operator. YouTube production readiness is not claimed until a real Google OAuth client, consent flow, refresh token and owned-playlist operation have been exercised by an operator.

Before deployment, run `npm ci` from a clean checkout, set a unique `TOKEN_ENCRYPTION_KEY`, verify the encrypted stores and backups, exercise provider login separately from MCP OAuth, and review the generated [tool reference](/tools-reference) and [environment reference](/environment-reference).

The TIDAL feasibility gate is recorded separately in [TIDAL feasibility](./tidal-feasibility). Its current result is `REQUIRES_WRITTEN_APPROVAL`; no TIDAL runtime integration is authorized by this repository.
