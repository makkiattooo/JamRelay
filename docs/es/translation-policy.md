---
title: Política de traducción
translationReviewed: 2026-09-12
---

# Política de traducción

La documentación en inglés es la **fuente canónica**. El polaco es una traducción de alta prioridad; alemán, francés y español se mantienen cuando es posible. Si hay diferencias, prevalece el inglés.

Las páginas traducidas que cambian con frecuencia pueden incluir `sourceHash` y `translationReviewed`. `npm run docs:check` compara el hash con la fuente inglesa actual y avisa si la traducción puede estar desactualizada. La advertencia no bloquea CI.

Las referencias de herramientas MCP y variables de entorno se generan para evitar duplicar manualmente los mismos datos técnicos en cinco idiomas.
