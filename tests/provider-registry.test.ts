import { describe, expect, it } from 'vitest';
import {
  ProviderApiError,
  ProviderRegistry,
  ProviderSelectionError,
} from '../src/providers/index.js';
import type { ProviderConnection } from '../src/providers/index.js';

const fake = (
  connectionId: string,
  provider: string,
  capabilities: ProviderConnection['summary']['capabilities'],
  connected = true,
): ProviderConnection => ({
  summary: { connectionId, provider, capabilities, connected },
});

describe('capability-based provider registry', () => {
  it('handles an empty registry', () => {
    const registry = new ProviderRegistry();
    expect(registry.listConnections()).toEqual([]);
    expect(registry.resolvePreferredReadTarget({ capability: 'catalog' })).toBeUndefined();
    expect(() => registry.resolveWriteTarget({ capability: 'playlistWrite' })).toThrow(
      ProviderSelectionError,
    );
  });

  it('selects the only capable connection and exposes summaries', () => {
    const registry = new ProviderRegistry();
    registry.register(fake('spotify-main', 'spotify', { catalog: true, playlistWrite: true }));
    expect(registry.selectConnections({ capability: 'catalog' })).toHaveLength(1);
    expect(registry.resolveWriteTarget({ capability: 'playlistWrite' }).summary.connectionId).toBe(
      'spotify-main',
    );
    expect(registry.listConnections()[0].provider).toBe('spotify');
  });

  it('supports multiple providers and filters missing capabilities', () => {
    const registry = new ProviderRegistry();
    registry.register(fake('a', 'alpha', { catalog: true }));
    registry.register(fake('b', 'beta', { playlistRead: true }));
    expect(
      registry.selectConnections({ capability: 'catalog' }).map((x) => x.summary.connectionId),
    ).toEqual(['a']);
    expect(registry.selectConnections({ provider: 'beta', capability: 'catalog' })).toEqual([]);
  });

  it('falls back for preferred reads when the preferred connection is unavailable', () => {
    const registry = new ProviderRegistry();
    registry.register(fake('preferred', 'alpha', { catalog: true }, false));
    registry.register(fake('fallback', 'beta', { catalog: true }));
    expect(
      registry.resolvePreferredReadTarget({
        capability: 'catalog',
        preferredConnectionId: 'preferred',
        strategy: 'preferred_then_fallback',
      })?.summary.connectionId,
    ).toBe('fallback');
  });

  it('fails closed for ambiguous writes and never uses a cross-provider fallback', () => {
    const registry = new ProviderRegistry();
    registry.register(fake('alpha-write', 'alpha', { playlistWrite: true }));
    registry.register(fake('beta-write', 'beta', { playlistWrite: true }));
    expect(() => registry.resolveWriteTarget({ capability: 'playlistWrite' })).toThrow(
      ProviderSelectionError,
    );
    expect(() =>
      registry.resolveWriteTarget({
        capability: 'playlistWrite',
        preferredConnectionId: 'missing',
      }),
    ).toThrow(ProviderSelectionError);
  });

  it('preserves generic provider API error context', () => {
    const error = new ProviderApiError(429, 'Rate limited', 'beta', 'beta-main', {
      retryAfter: 30,
      scope: 'catalog',
      capability: 'catalog',
      providerCode: 'QUOTA_EXCEEDED',
    });
    expect(error).toMatchObject({
      status: 429,
      provider: 'beta',
      connectionId: 'beta-main',
      retryAfter: 30,
      scope: 'catalog',
      capability: 'catalog',
      providerCode: 'QUOTA_EXCEEDED',
    });
  });
});
