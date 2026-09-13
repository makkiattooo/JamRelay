---
title: Personalization and local history
description: What JamRelay can and cannot infer from locally observed playback history.
---

# Personalization and local history

Personalization is local-first and evidence-based. JamRelay may use synchronized recently-played results, playback observations, saved/library state, playlist membership and JamRelay-issued playback commands when those facts are available.

Raw events retain provenance and timestamps. Derived affinity uses explainable components such as observed play count, freshness decay and rediscovery value. A missing local event means “not observed by JamRelay”, never “definitely not played”. JamRelay does not invent dislikes, global popularity preferences or skip events.

The current implementation exposes local history, ranking, personalization planning, comparison, session queue planning and smart-next selection. Daily mixes, rotations and skip cleanup remain conservative unless the required local evidence and candidate source exist.
