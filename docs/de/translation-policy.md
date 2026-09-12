---
title: Übersetzungsrichtlinie
translationReviewed: 2026-09-12
---

# Übersetzungsrichtlinie

Die englische Dokumentation ist die **kanonische Quelle**. Polnisch hat hohe Priorität; Deutsch, Französisch und Spanisch werden nach Möglichkeit gepflegt. Bei Abweichungen gilt die englische Version.

Schnell veränderliche übersetzte Seiten können `sourceHash` und `translationReviewed` enthalten. `npm run docs:check` vergleicht den Hash mit der aktuellen englischen Quelle und warnt, wenn die Übersetzung möglicherweise veraltet ist. Die Warnung blockiert CI nicht.

MCP-Tool- und Umgebungsvariablen-Referenzen werden generiert, damit technische Daten nicht in fünf Sprachen manuell dupliziert werden.
