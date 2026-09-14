import { ProviderSelectionError } from './errors.js';
import type { ProviderRegistry } from './registry.js';
import type { ProviderConnection } from './types.js';

export interface PlaylistWriteTarget {
  connection_id?: string;
  provider?: string;
  preferred_connection_id?: string;
}

/** Provider-neutral playlist transport. It deliberately never constructs provider URLs. */
export class PlaylistGateway {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly defaults: { preferredWriteConnectionId?: string } = {},
  ) {}

  private target(options: PlaylistWriteTarget = {}): ProviderConnection {
    return this.registry.resolveWriteTarget({
      provider: options.provider,
      capability: 'playlistWrite',
      preferredConnectionId:
        options.connection_id ??
        options.preferred_connection_id ??
        this.defaults.preferredWriteConnectionId,
    });
  }

  private write<T>(
    options: PlaylistWriteTarget,
    operation: (connection: ProviderConnection) => Promise<T>,
  ) {
    const connection = this.target(options);
    if (!connection.playlistWrite)
      throw new ProviderSelectionError(
        'Selected connection lacks playlist write capability.',
        'write',
        [connection.summary.connectionId],
      );
    return operation(connection);
  }

  list(options: Record<string, unknown> = {}) {
    const connection = this.registry.resolvePreferredReadTarget({
      provider: options.provider as string | undefined,
      capability: 'playlistRead',
      preferredConnectionId: options.connection_id as string | undefined,
    });
    if (!connection?.playlistRead)
      throw new ProviderSelectionError('No playlist read connection is available.', 'read');
    return connection.playlistRead.listPlaylists(options);
  }
  get(id: string, options: Record<string, unknown> = {}) {
    const connection = this.registry.resolvePreferredReadTarget({
      provider: options.provider as string | undefined,
      capability: 'playlistRead',
      preferredConnectionId: options.connection_id as string | undefined,
    });
    if (!connection?.playlistRead)
      throw new ProviderSelectionError('No playlist read connection is available.', 'read');
    return connection.playlistRead.getPlaylist(id, options);
  }
  items(id: string, options: Record<string, unknown> = {}) {
    const connection = this.registry.resolvePreferredReadTarget({
      provider: options.provider as string | undefined,
      capability: 'playlistRead',
      preferredConnectionId: options.connection_id as string | undefined,
    });
    if (!connection?.playlistRead)
      throw new ProviderSelectionError('No playlist read connection is available.', 'read');
    return connection.playlistRead.getPlaylistTracks(id, options);
  }
  create(input: unknown, options: PlaylistWriteTarget = {}) {
    return this.write(options, (c) => c.playlistWrite!.createPlaylist(input));
  }
  add(id: string, trackIds: string[], options: PlaylistWriteTarget = {}) {
    return this.write(options, (c) => c.playlistWrite!.addTracks(id, trackIds));
  }
  remove(
    id: string,
    trackIds: string[],
    input: Record<string, unknown> = {},
    options: PlaylistWriteTarget = {},
  ) {
    return this.write(options, (c) => c.playlistWrite!.removeTracks(id, trackIds, input));
  }
  reorder(id: string, input: unknown, options: PlaylistWriteTarget = {}) {
    return this.write(options, (c) => c.playlistWrite!.reorderTracks(id, input));
  }
  replace(id: string, trackIds: string[], options: PlaylistWriteTarget = {}) {
    return this.write(options, (c) => c.playlistWrite!.replaceTracks(id, trackIds));
  }
  update(id: string, input: unknown, options: PlaylistWriteTarget = {}) {
    return this.write(options, (c) => c.playlistWrite!.updatePlaylist(id, input));
  }
}
