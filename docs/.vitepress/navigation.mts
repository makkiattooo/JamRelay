import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    label: 'Getting Started',
    labels: {
      pl: 'Pierwsze kroki',
      de: 'Erste Schritte',
      fr: 'Bien démarrer',
      es: 'Primeros pasos',
    },
    pages: [
      {
        path: '',
        label: 'Overview',
        labels: {
          pl: 'Wprowadzenie',
          de: 'Überblick',
          fr: 'Présentation',
          es: 'Introducción',
        },
      },
      {
        path: 'getting-started',
        label: 'Quick start',
        labels: {
          pl: 'Szybki start',
          de: 'Schnellstart',
          fr: 'Démarrage rapide',
          es: 'Inicio rápido',
        },
      },
    ],
  },
  {
    label: 'Installation & Deployment',
    labels: {
      pl: 'Instalacja i wdrożenie',
      de: 'Installation & Betrieb',
      fr: 'Installation et déploiement',
      es: 'Instalación y despliegue',
    },
    pages: [
      {
        path: 'installation',
        label: 'Installation',
        labels: {
          pl: 'Instalacja',
          de: 'Installation',
          fr: 'Installation',
          es: 'Instalación',
        },
      },
      {
        path: 'configuration',
        label: 'Configuration',
        labels: {
          pl: 'Konfiguracja',
          de: 'Konfiguration',
          fr: 'Configuration',
          es: 'Configuración',
        },
      },
      {
        path: 'operations',
        label: 'Operations and backups',
      },
      {
        path: 'cli-information',
        label: 'CLI information',
      },
    ],
  },
  {
    label: 'Connect AI',
    labels: {
      pl: 'Połącz AI',
      de: 'KI verbinden',
      fr: 'Connecter une IA',
      es: 'Conectar IA',
    },
    pages: [
      {
        path: 'clients/',
        label: 'MCP clients',
        labels: {
          pl: 'Klienci MCP',
          de: 'MCP-Clients',
          fr: 'Clients MCP',
          es: 'Clientes MCP',
        },
      },
      {
        path: 'oauth',
        label: 'Authentication and OAuth',
        labels: {
          pl: 'Uwierzytelnianie i OAuth',
          de: 'Authentifizierung und OAuth',
          fr: 'Authentification et OAuth',
          es: 'Autenticación y OAuth',
        },
      },
      {
        path: 'clients/compatibility',
        label: 'Client compatibility',
      },
    ],
  },
  {
    label: 'Music Providers',
    labels: {
      pl: 'Serwisy muzyczne',
      de: 'Musikdienste',
      fr: 'Services musicaux',
      es: 'Servicios de música',
    },
    pages: [
      {
        path: 'providers/',
        label: 'Supported providers',
      },
      {
        path: 'provider-connections',
        label: 'Provider connections',
      },
      {
        path: 'providers/capabilities',
        label: 'Provider capabilities',
      },
    ],
  },
  {
    label: 'Guides & Automation',
    labels: {
      pl: 'Poradniki i automatyzacja',
      de: 'Anleitungen & Automatisierung',
      fr: 'Guides et automatisation',
      es: 'Guías y automatización',
    },
    pages: [
      {
        path: 'playlist-automation',
        label: 'Playlist automation',
      },
      {
        path: 'playlist-safety',
        label: 'Safety and recovery',
      },
      {
        path: 'playlist-rules',
        label: 'Rules and recipes',
      },
      {
        path: 'playlist-personalization',
        label: 'Personalization',
      },
      {
        path: 'playlist-import-export',
        label: 'Import and export',
      },
    ],
  },
  {
    label: 'Reference',
    labels: {
      pl: 'Dokumentacja techniczna',
      de: 'Referenz',
      fr: 'Référence',
      es: 'Referencia',
    },
    pages: [
      {
        path: 'tools-reference',
        label: 'MCP tools',
        labels: {
          pl: 'Narzędzia MCP',
          de: 'MCP-Tools',
          fr: 'Outils MCP',
          es: 'Herramientas MCP',
        },
      },
      {
        path: 'environment-reference',
        label: 'Environment variables',
        labels: {
          pl: 'Zmienne środowiskowe',
          de: 'Umgebungsvariablen',
          fr: 'Variables d’environnement',
          es: 'Variables de entorno',
        },
      },
      {
        path: 'endpoints',
        label: 'HTTP endpoints',
      },
      {
        path: 'errors',
        label: 'Errors',
      },
      {
        path: 'security',
        label: 'Security',
      },
    ],
  },
  {
    label: 'Development',
    labels: {
      pl: 'Rozwój projektu',
      de: 'Entwicklung',
      fr: 'Développement',
      es: 'Desarrollo',
    },
    pages: [
      {
        path: 'development',
        label: 'Contributing and releases',
      },
      {
        path: 'architecture',
        label: 'Architecture',
      },
      {
        path: 'state-database',
        label: 'State database',
      },
      {
        path: 'translation-policy',
        label: 'Translations',
      },
    ],
  },
];
const text = (locale: DocsLocale, page: Page | Section) => page.labels?.[locale] ?? page.label;
export const docsLink = (locale: DocsLocale, path: string) =>
  `${localeMeta[locale].prefix}/${path}`.replace(/\/+/g, '/');
const docsRoot = fileURLToPath(new URL('../', import.meta.url));
const pageExists = (locale: DocsLocale, path: string) =>
  existsSync(
    resolve(
      docsRoot,
      locale === 'en' ? '' : locale,
      `${path.endsWith('/') ? path + 'index' : path || 'index'}.md`,
    ),
  );
const item = (locale: DocsLocale, page: Page) => {
  const translated = pageExists(locale, page.path);
  return {
    text: text(locale, page) + (locale !== 'en' && !translated ? ' (EN)' : ''),
    link: docsLink(translated ? locale : 'en', page.path),
  };
};
export const buildSidebar = (locale: DocsLocale) =>
  sections.map((section) => ({
    text: text(locale, section),
    collapsed: section !== sections[0],
    items: section.pages.map((page) => item(locale, page)),
  }));
export const buildSidebars = () =>
  Object.fromEntries(
    docsLocales.map((locale) => [
      locale === 'en' ? '/' : `${localeMeta[locale].prefix}/`,
      buildSidebar(locale),
    ]),
  );
export const buildNav = (locale: DocsLocale) =>
  ['installation', 'clients/', 'providers/', 'tools-reference'].map((path) =>
    item(
      locale,
      sections.flatMap((s) => s.pages).find((p) => p.path === path)!,
    ),
  );
