---
title: Politique de traduction
translationReviewed: 2026-09-12
---

# Politique de traduction

La documentation anglaise est la **source canonique**. Le polonais est prioritaire; l’allemand, le français et l’espagnol sont maintenus au mieux. En cas de divergence, la version anglaise prévaut.

Les pages traduites qui changent souvent peuvent contenir `sourceHash` et `translationReviewed`. `npm run docs:check` compare le hash à la source anglaise actuelle et affiche un avertissement si la traduction peut être obsolète. Cet avertissement ne bloque pas la CI.

Les références des outils MCP et des variables d’environnement sont générées afin d’éviter de dupliquer manuellement les mêmes données techniques dans cinq langues.
