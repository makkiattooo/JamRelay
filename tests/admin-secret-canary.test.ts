import { describe, expect, it } from 'vitest';
import {
  adminConfirmationPage,
  adminJobDetailPage,
  adminListPage,
  adminLoginPage,
  authResultPage,
  clientDetailPage,
  clientsPage,
  connectionDetailPage,
  connectionsPage,
  dashboardPage,
  providerChooserPage,
  systemStatusPage,
} from '../src/web/ui.js';

describe('admin secret canary', () => {
  it('never renders credential-like values in any admin view', () => {
    const canaries = [
      'SHOULD_NEVER_RENDER_SPOTIFY_SECRET',
      'SHOULD_NEVER_RENDER_MCP_KEY',
      'SHOULD_NEVER_RENDER_ENCRYPTION_KEY',
      'SHOULD_NEVER_RENDER_REFRESH_TOKEN',
    ];
    const html = [
      adminLoginPage(),
      adminConfirmationPage('Sign out', 'Confirm sign out.', '/admin/logout', 'csrf'),
      authResultPage('spotify', false, 'Authorization failed', 'request-id'),
      dashboardPage({
        connections: 1,
        connected: 1,
        clients: 1,
        schema: 'current',
        providerOverview: [
          {
            connectionId: 'spotify-default',
            provider: 'spotify',
            displayName: 'Spotify',
            capabilities: {},
          },
        ],
        recentFailures: [{ provider: 'spotify', reason: 'rate limited' }],
        warnings: ['At least one provider rate limit is active.'],
      }),
      connectionsPage(
        [
          {
            connectionId: 'spotify-default',
            provider: 'spotify',
            displayName: 'Spotify',
            capabilities: {},
          },
        ],
        {},
      ),
      connectionDetailPage(
        {
          connectionId: 'spotify-default',
          provider: 'spotify',
          displayName: 'Spotify',
          capabilities: {},
        },
        {},
        'csrf',
      ),
      providerChooserPage([{ id: 'spotify', label: 'Spotify', configured: true }], 'csrf'),
      clientsPage([
        { clientId: 'client-1', connectionIds: ['spotify-default'], permissions: ['catalog.read'] },
      ]),
      clientDetailPage(
        { clientId: 'client-1', connectionIds: ['spotify-default'], permissions: ['catalog.read'] },
        [{ connectionId: 'spotify-default', provider: 'spotify', capabilities: {} }],
        'csrf',
      ),
      systemStatusPage({
        version: '1.2.0',
        schema: 'current',
        authMode: 'bearer',
        providers: 'spotify:connected',
        runtime: ['Toolset: all'],
      }),
      adminListPage(
        'Diagnostics',
        'Provider diagnostics.',
        'diagnostics',
        ['Value'],
        [['safe']],
        'No errors.',
      ),
      adminJobDetailPage(
        {
          id: 1,
          type: 'playlist-transfer',
          status: 'failed',
          attempts: 1,
          maxAttempts: 2,
          createdAt: 0,
          updatedAt: 0,
          counts: [],
          provider: 'spotify',
          connectionId: 'spotify-default',
          manualReviewReason: 'retry required',
        },
        'csrf',
      ),
    ].join('\n');
    for (const canary of canaries) expect(html).not.toContain(canary);
  });
});
