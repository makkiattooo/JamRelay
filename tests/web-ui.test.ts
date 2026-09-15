import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  adminLoginPage,
  authResultPage,
  connectionDetailPage,
  connectionsPage,
  clientsPage,
  providerChooserPage,
  systemStatusPage,
  dashboardPage,
  adminPageHeaders,
  escapeHtml,
} from '../src/web/ui.js';
import { oauthPageHeaders } from '../src/mcp/oauth-authorize-page.js';

describe('JamRelay web UI', () => {
  it('escapes owner/provider-controlled values', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    const html = connectionDetailPage(
      {
        connectionId: 'conn-<x>',
        provider: 'evil',
        displayName: '<img src=x onerror=alert(1)>',
        capabilities: {},
      },
      {},
    );
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('provides distinct owner, connection and callback experiences', () => {
    expect(adminLoginPage()).toContain('JamRelay Administration');
    expect(connectionsPage([], {})).toContain('Connection Hub');
    expect(authResultPage('spotify', true, 'connected')).toContain('Connection successful');
    expect(
      providerChooserPage([{ id: 'soundcloud', label: 'SoundCloud', configured: false }]),
    ).toContain('Not configured');
    expect(
      providerChooserPage([{ id: 'apple-music', label: 'Apple Music', configured: true }]),
    ).toContain('Music User Token onboarding');
    expect(clientsPage([])).toContain('Authorized MCP clients');
    expect(
      systemStatusPage({
        version: '1.3.0',
        schema: 'current',
        authMode: 'none',
        providers: 'none',
      }),
    ).toContain('Provider connectivity');
  });

  it('uses the self-hosted admin shell and separate strict admin CSP', () => {
    const html = dashboardPage({ connections: 0, connected: 0, clients: 0, schema: 'ready' });
    expect(html).toContain('/assets/admin/admin.css');
    expect(html).toContain('data-nav-toggle');
    expect(adminPageHeaders['Content-Security-Policy']).toContain("script-src 'self'");
    expect(adminPageHeaders['Content-Security-Policy']).not.toContain('unsafe-inline');
  });

  it('keeps responsive layout in the external admin stylesheet', async () => {
    const css = await readFile('assets/admin/admin.css', 'utf8');
    expect(css).toContain('@media (max-width: 850px)');
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toContain('grid-template-columns: var(--sidebar) minmax(0, 1fr)');
    expect(css).toContain('min-width: 0');
    expect(css).toContain('width: min(100%, 760px)');
  });

  it('allows the styled provider callback to load the shared admin stylesheet', () => {
    expect(oauthPageHeaders['Content-Security-Policy']).toContain(
      "style-src 'self' 'unsafe-inline'",
    );
    expect(authResultPage('spotify', true, 'connected')).toContain('/assets/admin/admin.css');
  });
});
