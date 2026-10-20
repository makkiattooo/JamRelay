import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { APP_VERSION } from '../src/version.js';
import { languages } from '../src/cli/i18n/index.js';
import {
  connectivityTranslations,
  normalizeDomain,
  providerRedirectUris,
  recordNameForHost,
  tunnelDnsTarget,
  verifyEndpoint,
} from '../src/cli/connectivity.js';

describe('guided connectivity setup', () => {
  it('normalizes international domains and rejects URL-like or private hosts', () => {
    expect(normalizeDomain('MÜNCHEN.acme.de')).toBe('xn--mnchen-3ya.acme.de');
    expect(normalizeDomain('https://acme.com')).toBeUndefined();
    expect(normalizeDomain('127.0.0.1')).toBeUndefined();
    expect(normalizeDomain('*.example.com')).toBeUndefined();
  });

  it('derives exact DNS labels and Cloudflare tunnel targets without guessing', () => {
    expect(recordNameForHost('music.acme.com', 'acme.com')).toBe('music');
    expect(recordNameForHost('acme.com', 'acme.com')).toBe('@');
    expect(recordNameForHost('elsewhere.net', 'acme.com')).toBeUndefined();
    expect(tunnelDnsTarget('12345678-1234-4234-8234-123456789abc')).toBe(
      '12345678-1234-4234-8234-123456789abc.cfargotunnel.com',
    );
    expect(tunnelDnsTarget('')).toBeUndefined();
  });

  it('derives exact provider callback URLs from the verified public origin', () => {
    expect(providerRedirectUris('https://music.acme.com')).toEqual({
      spotify: 'https://music.acme.com/auth/providers/spotify/callback',
      soundcloud: 'https://music.acme.com/auth/providers/soundcloud/callback',
      youtube: 'https://music.acme.com/auth/providers/youtube/callback',
    });
  });

  it('provides fully populated, localized domain and connectivity instructions', () => {
    const required = [
      'localHelp',
      'tailscaleHelp',
      'ngrokHelp',
      'quickHelp',
      'cloudflareIntro',
      'cloudflareSteps',
      'directDns',
      'caddyConfig',
      'nginxConfig',
      'errors',
      'checkTitle',
    ];
    for (const language of languages) {
      expect(Object.keys(connectivityTranslations[language]).sort()).toEqual(
        Object.keys(connectivityTranslations.en).sort(),
      );
      for (const key of required)
        expect(connectivityTranslations[language][key], `${language}:${key}`).toBeTruthy();
      if (language !== 'en')
        expect(connectivityTranslations[language].localHelp).not.toBe(
          connectivityTranslations.en.localHelp,
        );
    }
  });

  it('requires a reachable local health endpoint and an authentication challenge at MCP', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/health') {
        response.writeHead(200).end(
          JSON.stringify({
            status: 'ok',
            version: APP_VERSION,
            database: { schemaState: 'current' },
          }),
        );
      } else if (request.url === '/mcp') {
        response.writeHead(401).end();
      } else response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not bind');
      await expect(verifyEndpoint(`http://127.0.0.1:${address.port}`, true)).resolves.toEqual({
        dns: null,
        https: null,
        health: true,
        mcpProtected: true,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
