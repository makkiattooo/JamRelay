export type DocsLocale = 'en' | 'pl' | 'de' | 'fr' | 'es';

type Page = {
  path: string;
  label: string;
  labels?: Partial<Record<DocsLocale, string>>;
};

type Section = {
  label: string;
  labels?: Partial<Record<DocsLocale, string>>;
  pages: Page[];
};

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

// One navigation manifest for every locale. Add a page here once.
// Localized labels are optional; English is the fallback.
export const sections: Section[] = [
  {
    label: 'Getting started',
    labels: { pl: 'Start', de: 'Einstieg', fr: 'Démarrage', es: 'Primeros pasos' },
    pages: [
      {
        path: '',
        label: 'Overview',
        labels: {
          pl: 'Przegląd',
          de: 'Übersicht',
          fr: 'Vue d’ensemble',
          es: 'Descripción general',
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
    label: 'Operate',
    labels: { pl: 'Obsługa', de: 'Betrieb', fr: 'Exploitation', es: 'Operación' },
    pages: [
      {
        path: 'installation',
        label: 'Installation and deployment',
        labels: {
          pl: 'Instalacja i wdrożenie',
          de: 'Installation und Deployment',
          fr: 'Installation et déploiement',
          es: 'Instalación y despliegue',
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
        path: 'oauth',
        label: 'OAuth',
        labels: { pl: 'OAuth', de: 'OAuth', fr: 'OAuth', es: 'OAuth' },
      },
      {
        path: 'operations',
        label: 'Operations runbook',
        labels: { pl: 'Operacje', de: 'Betriebsleitfaden', fr: 'Runbook', es: 'Runbook operativo' },
      },
      {
        path: 'security',
        label: 'Security',
        labels: { pl: 'Bezpieczeństwo', de: 'Sicherheit', fr: 'Sécurité', es: 'Seguridad' },
      },
      {
        path: 'troubleshooting',
        label: 'Troubleshooting',
        labels: {
          pl: 'Rozwiązywanie problemów',
          de: 'Fehlerbehebung',
          fr: 'Dépannage',
          es: 'Solución de problemas',
        },
      },
    ],
  },
  {
    label: 'Deployment options',
    labels: {
      pl: 'Opcje wdrożenia',
      de: 'Deployment-Optionen',
      fr: 'Options de déploiement',
      es: 'Opciones de despliegue',
    },
    pages: [
      {
        path: 'deployment/free-hosting',
        label: 'Free hosting',
        labels: {
          pl: 'Darmowy hosting',
          de: 'Kostenloses Hosting',
          fr: 'Hébergement gratuit',
          es: 'Hosting gratuito',
        },
      },
      {
        path: 'deployment/budget-hosting',
        label: 'Free and low-cost setup',
        labels: {
          pl: 'Darmowe i tanie wdrożenie',
          de: 'Kostenlos und günstig',
          fr: 'Gratuit et économique',
          es: 'Gratis y económico',
        },
      },
    ],
  },
  {
    label: 'Connect clients',
    labels: { pl: 'Klienci AI', de: 'AI-Clients', fr: 'Clients IA', es: 'Clientes de IA' },
    pages: [
      {
        path: 'clients/',
        label: 'Overview',
        labels: {
          pl: 'Przegląd',
          de: 'Übersicht',
          fr: 'Vue d’ensemble',
          es: 'Descripción general',
        },
      },
      { path: 'clients/chatgpt', label: 'ChatGPT' },
      { path: 'clients/claude', label: 'Claude' },
      { path: 'clients/gemini', label: 'Gemini CLI' },
      { path: 'clients/cursor', label: 'Cursor' },
      { path: 'clients/vscode-copilot', label: 'VS Code / Copilot' },
      { path: 'clients/windsurf', label: 'Windsurf' },
      { path: 'clients/mcp-inspector', label: 'MCP Inspector' },
      {
        path: 'clients/oauth-compatibility',
        label: 'OAuth and multi-client',
        labels: {
          pl: 'OAuth i multi-client',
          de: 'OAuth und Multi-Client',
          fr: 'OAuth et multi-client',
          es: 'OAuth y multi-cliente',
        },
      },
      {
        path: 'clients/compatibility',
        label: 'Compatibility matrix',
        labels: {
          pl: 'Kompatybilność',
          de: 'Kompatibilität',
          fr: 'Compatibilité',
          es: 'Compatibilidad',
        },
      },
      {
        path: 'mcp-client',
        label: 'Generic MCP client',
        labels: {
          pl: 'Generic MCP client',
          de: 'Generischer MCP-Client',
          fr: 'Client MCP générique',
          es: 'Cliente MCP genérico',
        },
      },
    ],
  },
  {
    label: 'Reference',
    labels: { pl: 'Referencja', de: 'Referenz', fr: 'Référence', es: 'Referencia' },
    pages: [
      {
        path: 'architecture',
        label: 'Architecture',
        labels: { pl: 'Architektura', de: 'Architektur', fr: 'Architecture', es: 'Arquitectura' },
      },
      {
        path: 'endpoints',
        label: 'HTTP endpoints',
        labels: {
          pl: 'Endpointy HTTP',
          de: 'HTTP-Endpunkte',
          fr: 'Endpoints HTTP',
          es: 'Endpoints HTTP',
        },
      },
      {
        path: 'tools',
        label: 'MCP tools',
        labels: { pl: 'Narzędzia MCP', de: 'MCP-Tools', fr: 'Outils MCP', es: 'Herramientas MCP' },
      },
      {
        path: 'tools-reference',
        label: 'Generated tool reference',
        labels: {
          pl: 'Generowana referencja narzędzi',
          de: 'Generierte Tool-Referenz',
          fr: 'Référence générée des outils',
          es: 'Referencia generada de herramientas',
        },
      },
      {
        path: 'environment-reference',
        label: 'Generated environment reference',
        labels: {
          pl: 'Generowana referencja zmiennych',
          de: 'Generierte Umgebungsreferenz',
          fr: 'Référence générée des variables',
          es: 'Referencia generada de variables',
        },
      },
      {
        path: 'errors',
        label: 'Errors and status codes',
        labels: { pl: 'Błędy', de: 'Fehler', fr: 'Erreurs', es: 'Errores' },
      },
      {
        path: 'development',
        label: 'Development',
        labels: { pl: 'Development', de: 'Entwicklung', fr: 'Développement', es: 'Desarrollo' },
      },
      {
        path: 'translation-policy',
        label: 'Translation policy',
        labels: {
          pl: 'Polityka tłumaczeń',
          de: 'Übersetzungsrichtlinie',
          fr: 'Politique de traduction',
          es: 'Política de traducción',
        },
      },
    ],
  },
];

const text = (
  locale: DocsLocale,
  value: { label: string; labels?: Partial<Record<DocsLocale, string>> },
) => value.labels?.[locale] ?? value.label;

export const docsLink = (locale: DocsLocale, path: string) => {
  const prefix = localeMeta[locale].prefix;
  if (!path) return prefix ? `${prefix}/` : '/';
  return `${prefix}/${path}`.replace(/\/+/g, '/');
};

export const buildSidebar = (locale: DocsLocale) =>
  sections.map((section) => ({
    text: text(locale, section),
    items: section.pages.map((page) => ({
      text: text(locale, page),
      link: docsLink(locale, page.path),
    })),
  }));

export const buildSidebars = () =>
  Object.fromEntries(
    docsLocales.map((locale) => [
      locale === 'en' ? '/' : `${localeMeta[locale].prefix}/`,
      buildSidebar(locale),
    ]),
  );
