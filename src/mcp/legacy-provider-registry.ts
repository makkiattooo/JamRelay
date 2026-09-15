import { ProviderRegistry } from '../providers/registry.js';
import { SpotifyProviderAdapter } from '../spotify/provider-adapter.js';
import type { ProviderHttpClient } from '../providers/http-client.js';

/** Compatibility registry for direct callers that predate ProviderRegistry injection. */
export const createLegacyProviderRegistry = (client: ProviderHttpClient) => {
  const registry = new ProviderRegistry();
  registry.register(new SpotifyProviderAdapter(undefined as any, client));
  return registry;
};
