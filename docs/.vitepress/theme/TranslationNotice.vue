<script setup lang="ts">
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';

const { page, frontmatter } = useData();

const locale = computed(() => {
  const first = page.value.relativePath.split('/')[0];
  return ['pl', 'de', 'fr', 'es'].includes(first) ? first : null;
});

const messages: Record<string, { title: string; body: string; reviewed: string; link: string }> = {
  pl: {
    title: 'Tłumaczenie może pozostawać w tyle',
    body: 'Angielska dokumentacja jest źródłem kanonicznym. W razie rozbieżności obowiązuje wersja angielska.',
    reviewed: 'Ta strona była zsynchronizowana z angielską wersją:',
    link: 'Otwórz wersję angielską',
  },
  de: {
    title: 'Diese Übersetzung kann hinterherhinken',
    body: 'Die englische Dokumentation ist die kanonische Quelle. Bei Abweichungen gilt die englische Version.',
    reviewed: 'Diese Seite wurde mit der englischen Version abgeglichen am:',
    link: 'Englische Version öffnen',
  },
  fr: {
    title: 'Cette traduction peut prendre du retard',
    body: 'La documentation anglaise est la source canonique. En cas de divergence, la version anglaise prévaut.',
    reviewed: 'Cette page a été synchronisée avec la version anglaise le :',
    link: 'Ouvrir la version anglaise',
  },
  es: {
    title: 'Esta traducción puede quedarse atrás',
    body: 'La documentación en inglés es la fuente canónica. Si hay diferencias, prevalece la versión inglesa.',
    reviewed: 'Esta página se sincronizó con la versión inglesa el:',
    link: 'Abrir la versión en inglés',
  },
};

const englishPath = computed(() => {
  if (!locale.value) return '/';
  const parts = page.value.relativePath.split('/').slice(1);
  const relative = parts.join('/').replace(/\.md$/, '');
  if (!relative || relative === 'index') return '/';
  return `/${relative.replace(/\/index$/, '/')}`;
});

const reviewed = computed(() => frontmatter.value.translationReviewed as string | undefined);
</script>

<template>
  <div v-if="locale" class="translation-notice">
    <strong>{{ messages[locale].title }}</strong>
    <span>{{ messages[locale].body }}</span>
    <span v-if="reviewed"
      >{{ messages[locale].reviewed }} <code>{{ reviewed }}</code></span
    >
    <a :href="withBase(englishPath)">{{ messages[locale].link }}</a>
  </div>
</template>
