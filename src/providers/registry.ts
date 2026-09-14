import type { ProviderCapabilityName } from './capabilities.js';
import { ProviderSelectionError } from './errors.js';
import type {
  ConnectionId,
  ProviderConnection,
  ProviderConnectionSummary,
  ProviderId,
} from './types.js';

export type ReadSelectionStrategy = 'preferred_then_fallback' | 'preferred_only';

export interface ProviderSelectionOptions {
  provider?: ProviderId;
  capability?: ProviderCapabilityName;
  preferredConnectionId?: ConnectionId;
  strategy?: ReadSelectionStrategy;
}

const isAvailable = (connection: ProviderConnection) => connection.summary.connected !== false;

export class ProviderRegistry {
  private readonly connections = new Map<ConnectionId, ProviderConnection>();
  private preferredReadConnectionId?: string;
  private preferredWriteConnectionId?: string;

  register(connection: ProviderConnection): void {
    const id = connection.summary.connectionId;
    if (!id) throw new Error('connectionId is required');
    this.connections.set(id, connection);
  }

  unregister(connectionId: ConnectionId): boolean {
    if (this.preferredReadConnectionId === connectionId) this.preferredReadConnectionId = undefined;
    if (this.preferredWriteConnectionId === connectionId)
      this.preferredWriteConnectionId = undefined;
    return this.connections.delete(connectionId);
  }

  setPreferredRead(connectionId: string) {
    if (!this.connections.has(connectionId)) throw new Error('connection_not_found');
    this.preferredReadConnectionId = connectionId;
  }
  setPreferredWrite(connectionId: string) {
    if (!this.connections.has(connectionId)) throw new Error('connection_not_found');
    this.preferredWriteConnectionId = connectionId;
  }
  getPreferred() {
    return { read: this.preferredReadConnectionId, write: this.preferredWriteConnectionId };
  }

  listConnections(): ProviderConnectionSummary[] {
    return [...this.connections.values()].map(({ summary }) => ({
      ...summary,
      capabilities: { ...summary.capabilities },
      metadata: summary.metadata ? { ...summary.metadata } : undefined,
    }));
  }

  getConnection(connectionId: ConnectionId): ProviderConnection | undefined {
    return this.connections.get(connectionId);
  }

  connectionMatchesProvider(connectionId: ConnectionId, provider: ProviderId): boolean {
    const connection = this.connections.get(connectionId);
    return Boolean(connection && connection.summary.provider === provider);
  }

  selectConnections(
    options: Omit<ProviderSelectionOptions, 'preferredConnectionId' | 'strategy'> = {},
  ) {
    return [...this.connections.values()].filter((connection) => {
      const summary = connection.summary;
      return (
        isAvailable(connection) &&
        (!options.provider || summary.provider === options.provider) &&
        (!options.capability || summary.capabilities[options.capability] === true)
      );
    });
  }

  resolvePreferredReadTarget(
    options: ProviderSelectionOptions = {},
  ): ProviderConnection | undefined {
    const candidates = this.selectConnections(options);
    const preferred = options.preferredConnectionId
      ? candidates.find((x) => x.summary.connectionId === options.preferredConnectionId)
      : undefined;
    if (preferred) return preferred;
    if (options.strategy === 'preferred_only') return undefined;
    return candidates[0];
  }

  /**
   * Resolve one and only one write target. A missing preferred target is not
   * replaced by another connection, because writes must fail closed.
   */
  resolveWriteTarget(options: ProviderSelectionOptions = {}): ProviderConnection {
    const allMatching = [...this.connections.values()].filter((connection) => {
      const summary = connection.summary;
      return (
        (!options.provider || summary.provider === options.provider) &&
        (!options.capability || summary.capabilities[options.capability] === true)
      );
    });
    if (options.preferredConnectionId) {
      const preferred = this.connections.get(options.preferredConnectionId);
      if (!preferred || !isAvailable(preferred) || !allMatching.includes(preferred))
        throw new ProviderSelectionError(
          `Write target ${options.preferredConnectionId} is unavailable or lacks the requested capability.`,
          'write',
          allMatching.map((x) => x.summary.connectionId),
        );
      return preferred;
    }
    const candidates = allMatching.filter(isAvailable);
    if (candidates.length !== 1)
      throw new ProviderSelectionError(
        candidates.length === 0
          ? 'No available provider connection can perform this write.'
          : 'Write target is ambiguous; select exactly one provider connection.',
        'write',
        candidates.map((x) => x.summary.connectionId),
      );
    return candidates[0];
  }
}
