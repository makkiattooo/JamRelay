import type { ProviderCapabilities, ProviderCapabilityImplementations } from './capabilities.js';

/** Extensible by design: adding a provider does not require editing this type. */
export type ProviderId = string;
export type ConnectionId = string;

export interface ProviderConnectionSummary {
  connectionId: ConnectionId;
  provider: ProviderId;
  displayName?: string;
  connected?: boolean;
  capabilities: ProviderCapabilities;
  metadata?: Record<string, unknown>;
}

export interface ProviderConnection extends ProviderCapabilityImplementations {
  summary: ProviderConnectionSummary;
}
