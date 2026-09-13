import { defineConfig } from 'vitepress';
import { buildSidebars, localeMeta } from './navigation.mts';

const repo =
  process.env.DOCS_REPOSITORY ?? process.env.GITHUB_REPOSITORY ?? 'your-org/your-repository';
const repoName = repo.split('/').at(-1) ?? '';
const automaticPagesBase =
  process.env.GITHUB_ACTIONS === 'true' && repoName && !repoName.endsWith('.github.io')
    ? `/${repoName}/`
    : '/';
const pagesBase = process.env.DOCS_BASE ?? automaticPagesBase;
const faviconHref = `${pagesBase}favicon.ico`;

export default defineConfig({
  title: 'JamRelay',
  description:
    'Self-hosted music automation through MCP, Spotify, durable state and safe playlist operations.',
  lang: 'en',
  base: pagesBase,
  head: [['link', { rel: 'icon', href: faviconHref }]],
  locales: {
    root: { label: localeMeta.en.label, lang: localeMeta.en.lang },
    pl: { label: localeMeta.pl.label, lang: localeMeta.pl.lang, link: '/pl/' },
    de: { label: localeMeta.de.label, lang: localeMeta.de.lang, link: '/de/' },
    fr: { label: localeMeta.fr.label, lang: localeMeta.fr.lang, link: '/fr/' },
    es: { label: localeMeta.es.label, lang: localeMeta.es.lang, link: '/es/' },
  },
  themeConfig: {
    nav: [
      { text: 'Get started', link: '/getting-started' },
      { text: 'Features', link: '/playlist-automation' },
      { text: 'Clients', link: '/clients/' },
      { text: 'Deploy', link: '/installation' },
      { text: 'Reference', link: '/tools-reference' },
      {
        text: 'Languages',
        items: [
          { text: 'English', link: '/' },
          { text: 'Polski', link: '/pl/' },
          { text: 'Deutsch', link: '/de/' },
          { text: 'Français', link: '/fr/' },
          { text: 'Español', link: '/es/' },
        ],
      },
    ],
    sidebar: buildSidebars(),
    socialLinks: [{ icon: 'github', link: `https://github.com/${repo}` }],
    search: { provider: 'local' },
    footer: {
      message: 'Unofficial community project. Not affiliated with Spotify or AI platform vendors.',
      copyright: 'AGPL-3.0-only',
    },
  },
});
