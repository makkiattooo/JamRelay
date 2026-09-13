---
title: Translation policy
description: How JamRelay maintains English, Polish, German, French and Spanish documentation.
---

# Translation policy

English is the **canonical source of truth** for JamRelay documentation.

- **English** — canonical and expected to be current.
- **Polish** — high-priority translation.
- **German, French, Spanish** — best effort.

Non-English pages display a notice explaining that English wins if two versions disagree. This is intentional: a release should not require editing the same technical statement in five places before a bug fix can ship.

## Freshness metadata

Fast-changing translated pages can include:

```yaml
translationReviewed: 2026-09-12
sourceHash: abcdef123456
```

`sourceHash` is the SHA-256 prefix of the corresponding English page at the time the translation was reviewed. `npm run docs:check` compares it with the current English source and prints a warning if the English page has changed. The warning does **not** fail CI: translations are explicitly allowed to lag.

## Generated references

Tool and environment references are generated rather than translated by hand. The localized pages point users back to the canonical generated technical data.

## When adding a page

Add navigation once in `docs/.vitepress/navigation.mts`. Create the English page first. Add translations when useful; they do not block a release unless the project owner chooses to make a specific translation a release requirement.
