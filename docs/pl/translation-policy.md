---
title: Polityka tłumaczeń
translationReviewed: 2026-09-12
---

# Polityka tłumaczeń

Dokumentacja angielska jest **kanonicznym źródłem prawdy**. Polski jest tłumaczeniem wysokiego priorytetu, a niemiecki, francuski i hiszpański są utrzymywane best-effort. Jeśli wersje się różnią, obowiązuje angielska.

Wybrane szybko zmieniające się strony mają w frontmatter `sourceHash` i datę `translationReviewed`. `npm run docs:check` porównuje hash z aktualną wersją angielską i ostrzega, gdy tłumaczenie może być stare. Ostrzeżenie nie blokuje CI — tłumaczenia mogą legalnie pozostawać w tyle.

Referencje narzędzi MCP i zmiennych środowiskowych są generowane, żeby nie przepisywać tych samych danych technicznych w pięciu językach.
