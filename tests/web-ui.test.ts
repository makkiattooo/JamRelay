import { describe, expect, it } from 'vitest';
import {
  adminLoginPage,
  authResultPage,
  connectionDetailPage,
  connectionsPage,
  clientsPage,
  providerChooserPage,
  systemStatusPage,
  escapeHtml,
} from '../src/web/ui.js';

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
        version: '1.2.0',
        schema: 'current',
        authMode: 'none',
        providers: 'none',
      }),
    ).toContain('Provider connectivity');
  });
});
