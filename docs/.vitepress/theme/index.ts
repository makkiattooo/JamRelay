import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import TranslationNotice from './TranslationNotice.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'doc-before': () => h(TranslationNotice),
    }),
};
