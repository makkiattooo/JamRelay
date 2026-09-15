import { TrackResolver } from '../spotify/resolver.js';
import type { ProviderHttpClient } from '../providers/http-client.js';
import type { TrackResolutionService } from '../music/resolver-service.js';

/** Compatibility composition for the historical Spotify resolver surface. */
export const createLegacyResolver = (client: ProviderHttpClient): TrackResolutionService =>
  new TrackResolver(client);
