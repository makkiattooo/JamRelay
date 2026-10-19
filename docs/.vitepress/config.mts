import { defineConfig } from 'vitepress';
import { buildSidebars, buildNav, docsLocales, localeMeta } from './navigation.mts';

const repo = process.env.DOCS_REPOSITORY ?? process.env.GITHUB_REPOSITORY ?? 'makkiattooo/JamRelay';
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
    'Self-hosted music automation through MCP across Spotify, SoundCloud, Apple Music and YouTube.',
  lang: 'en',
  base: pagesBase,
  head: [['link', { rel: 'icon', href: faviconHref }]],
  locales: Object.fromEntries(
    docsLocales.map((locale) => [
      locale === 'en' ? 'root' : locale,
      {
        label: localeMeta[locale].label,
        lang: localeMeta[locale].lang,
        link: localeMeta[locale].prefix + '/',
        themeConfig: { nav: buildNav(locale) },
      },
    ]),
  ),
  themeConfig: {
    nav: buildNav('en'),
    sidebar: buildSidebars(),
    socialLinks: [{ icon: 'github', link: `https://github.com/${repo}` }],
    search: { provider: 'local' },
    footer: {
      message: 'Unofficial community project. Not affiliated with Spotify or AI platform vendors.',
      copyright: 'AGPL-3.0-only',
    },
  },
});
