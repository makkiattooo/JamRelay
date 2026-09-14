import { describe, expect, it } from 'vitest';
import { ProviderReadServices } from '../src/providers/read-services.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { CapabilityUnavailableError } from '../src/providers/errors.js';

const connection = (connectionId: string, provider: string, value: string, fail = false): any => ({
  summary: { connectionId, provider, capabilities: { catalog: true } },
  catalog: {
    searchTracks: async () => {
      if (fail) throw new Error('temporary upstream failure');
      return [{ id: value, name: value, artists: [] }];
    },
  },
});

const services = (...connections: any[]) => {
  const registry = new ProviderRegistry();
  for (const item of connections) registry.register(item);
  return new ProviderReadServices(registry);
};

describe('provider-neutral read services', () => {
  it('routes to the explicit connection before provider/default selection', async () => {
    const result = await services(
      connection('a', 'alpha', 'A'),
      connection('b', 'beta', 'B'),
    ).searchTracks('query', { connection_id: 'b', provider: 'alpha' });
    expect(result.data[0].id).toBe('B');
    expect(result.provenance).toMatchObject({
      provider: 'beta',
      connection_id: 'b',
      fallback: false,
    });
  });

  it('honors an explicit provider and preferred connection', async () => {
    const result = await services(
      connection('a', 'alpha', 'A'),
      connection('b', 'beta', 'B'),
    ).searchTracks('query', { provider: 'beta', preferred_connection_id: 'b' });
    expect(result.data[0].id).toBe('B');
  });

  it('falls back between read connections and records provenance', async () => {
    const result = await services(
      connection('a', 'alpha', 'A', true),
      connection('b', 'beta', 'B'),
    ).searchTracks('query');
    expect(result.data[0].id).toBe('B');
    expect(result.provenance.fallback).toBe(true);
  });

  it('can disable read fallback', async () => {
    await expect(
      services(connection('a', 'alpha', 'A', true), connection('b', 'beta', 'B')).searchTracks(
        'q',
        {
          read_fallback: false,
        },
      ),
    ).rejects.toThrow('temporary upstream failure');
  });

  it('reports an unsupported capability structurally', async () => {
    const registry = new ProviderRegistry();
    registry.register({
      summary: { connectionId: 'a', provider: 'alpha', capabilities: { catalog: true } },
      catalog: {},
    });
    const read = new ProviderReadServices(registry);
    await expect(read.searchArtists('q')).rejects.toBeInstanceOf(CapabilityUnavailableError);
  });
});
