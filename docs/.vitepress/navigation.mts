import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
export type DocsLocale = 'en' | 'pl' | 'de' | 'fr' | 'es';
type Page = { path: string; label: string; labels?: Partial<Record<DocsLocale, string>> };
type Section = { label: string; labels?: Partial<Record<DocsLocale, string>>; pages: Page[] };
export const docsLocales: DocsLocale[] = ['en', 'pl', 'de', 'fr', 'es'];
export const localeMeta: Record<
  DocsLocale,
  { label: string; lang: string; prefix: string; canonical: boolean }
> = {
  en: { label: 'English', lang: 'en', prefix: '', canonical: true },
  pl: { label: 'Polski', lang: 'pl', prefix: '/pl', canonical: false },
  de: { label: 'Deutsch', lang: 'de', prefix: '/de', canonical: false },
  fr: { label: 'Français', lang: 'fr', prefix: '/fr', canonical: false },
  es: { label: 'Español', lang: 'es', prefix: '/es', canonical: false },
};
export const sections: Section[] = [
  {
    label: 'Get started',
    pages: [
      { path: '', label: 'Overview' },
      { path: 'getting-started', label: 'Quick start' },
      { path: 'installation', label: 'Requirements and installation' },
    ],
  },
  {
    label: 'Core concepts',
    pages: [
      { path: 'architecture', label: 'How JamRelay works' },
      { path: 'database-first-resolution', label: 'Database-first track resolution' },
      { path: 'playlist-safety', label: 'Playlist safety, snapshots and undo' },
      { path: 'state-database', label: 'State and persistence' },
      { path: 'operations', label: 'Jobs and rate limits' },
    ],
  },
  {
    label: 'Playlist automation',
    pages: [
      { path: 'playlist-automation', label: 'Automation overview' },
      { path: 'playlist-rules', label: 'Rules and recipes' },
      { path: 'playlist-personalization', label: 'Personalization and local history' },
    ],
  },
  {
    label: 'Connect clients',
    pages: [
      { path: 'clients/', label: 'Client overview' },
      { path: 'clients/chatgpt', label: 'ChatGPT' },
      { path: 'clients/claude', label: 'Claude' },
      { path: 'clients/gemini', label: 'Gemini CLI' },
      { path: 'clients/cursor', label: 'Cursor' },
      { path: 'clients/vscode-copilot', label: 'VS Code / Copilot' },
      { path: 'clients/windsurf', label: 'Windsurf' },
      { path: 'clients/mcp-inspector', label: 'MCP Inspector' },
      { path: 'clients/oauth-compatibility', label: 'OAuth compatibility' },
      { path: 'clients/compatibility', label: 'Compatibility matrix' },
      { path: 'mcp-client', label: 'Generic MCP client' },
    ],
  },
  {
    label: 'Operate and deploy',
    pages: [
      { path: 'configuration', label: 'Configuration' },
      { path: 'oauth', label: 'Authentication and OAuth' },
      { path: 'deployment/free-hosting', label: 'Deployment options' },
      { path: 'security', label: 'Security' },
      { path: 'troubleshooting', label: 'Troubleshooting' },
    ],
  },
  {
    label: 'Reference and development',
    pages: [
      { path: 'tools', label: 'Using JamRelay tools' },
      { path: 'tools-reference', label: 'Generated tool reference' },
      { path: 'environment-reference', label: 'Generated environment reference' },
      { path: 'endpoints', label: 'HTTP endpoints' },
      { path: 'errors', label: 'Errors and status codes' },
      { path: 'development', label: 'Development' },
      { path: 'translation-policy', label: 'Translation policy' },
    ],
  },
];
const text = (locale: DocsLocale, page: Page | Section) => page.labels?.[locale] ?? page.label;
export const docsLink = (locale: DocsLocale, path: string) =>
  `${localeMeta[locale].prefix}/${path}`.replace(/\/+/g, '/').replace(/\/$/, path ? '' : '/');
const pageExists = (locale: DocsLocale, path: string) =>
  existsSync(
    resolve(process.cwd(), 'docs', locale === 'en' ? '' : locale, `${path || 'index'}.md`),
  );
export const buildSidebar = (locale: DocsLocale) =>
  sections.map((section) => ({
    text: text(locale, section),
    items: section.pages.map((page) => ({
      text: text(locale, page),
      link: pageExists(locale, page.path) ? docsLink(locale, page.path) : docsLink('en', page.path),
    })),
  }));
export const buildSidebars = () =>
  Object.fromEntries(
    docsLocales.map((locale) => [
      locale === 'en' ? '/' : `${localeMeta[locale].prefix}/`,
      buildSidebar(locale),
    ]),
  );
