import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { ProviderApiError } from '../providers/errors.js';
import { parseProviderIdentifier } from '../providers/identifiers.js';
import { chunks } from '../utils/chunks.js';
import { normalizeText, resolveCandidates } from '../music/normalize.js';
import { paginate } from '../providers/pagination.js';
import { writeChunks } from '../providers/write-operation.js';
import { toApiError } from '../http/errors.js';
import { registerAdvanced } from './helpers.js';
import { createLegacyResolver } from './legacy-resolver.js';
import { toolContext } from './context.js';
import type { Logger } from 'pino';
import { indexCanonicalTrack } from '../db/state.js';
import { getRateLimit } from '../db/state.js';
import { isDatabaseInitialized } from '../db/database.js';
import { PLAYLIST_AUTOMATION_TOOL_NAMES } from '../playlists/automation.js';
import { PLAYLIST_PERSONALIZATION_TOOL_NAMES } from '../playlists/personalization.js';
import { ProviderRegistry } from '../providers/registry.js';
import {
  ProviderReadServices,
  type ReadResult,
  type ReadRoutingOptions,
} from '../providers/read-services.js';
import { PlaylistGateway, type PlaylistWriteTarget } from '../providers/playlist-gateway.js';
import type { ProviderHttpClient } from '../providers/http-client.js';
import type { TrackResolutionService } from '../music/resolver-service.js';
import { createLegacyProviderRegistry } from './legacy-provider-registry.js';
import { isDraining } from '../runtime/lifecycle.js';
import { getToolSecurityMetadata, type ToolExecutionClass } from './tool-manifest.js';
import {
  exportPlaylist,
  parsePlaylistImport,
  type PlaylistDocument,
  type PlaylistFormat,
} from '../playlists/import-export.js';
import { planPlaylistTransfer } from '../playlists/transfer-planner.js';
import {
  executePlaylistTransfer,
  syncPlaylistTransfer,
  type TransferPlan,
  type TransferSyncPolicy,
} from '../playlists/transfer-execution.js';
const id = z.string().min(1),
  limit = z.number().int().min(1).max(50).default(20);
const track = (x: any) =>
  x
    ? {
        ...(indexCanonicalTrack(x), {}),
        id: x.id,
        uri: x.uri ?? x.metadata?.providerUri,
        name: x.name,
        artists: (x.artists ?? []).map((a: any) => ({ id: a.id, name: a.name })),
        album: x.album ? { id: x.album.id, name: x.album.name } : undefined,
        duration_ms: x.duration_ms ?? x.metadata?.durationMs,
        explicit: x.explicit ?? x.metadata?.explicit,
        external_url: x.external_url ?? x.metadata?.providerUrl ?? x.external_urls?.spotify,
      }
    : null;
const episode = (x: any) =>
  x
    ? {
        id: x.id,
        uri: x.uri,
        name: x.name,
        description: x.description,
        duration_ms: x.duration_ms,
        release_date: x.release_date,
        explicit: x.explicit,
        show: x.show ? { id: x.show.id, name: x.show.name, uri: x.show.uri } : undefined,
        external_url: x.external_urls?.spotify,
      }
    : null;
const playbackItem = (x: any) =>
  x?.type === 'track' || (x?.metadata && x.metadata.mediaType !== 'episode')
    ? track(x)
    : x?.type === 'episode' || x?.metadata?.mediaType === 'episode'
      ? {
          id: x.id,
          uri: x.uri ?? x.metadata?.providerUri,
          name: x.name,
          description: x.description ?? x.metadata?.description,
          duration_ms: x.duration_ms ?? x.metadata?.durationMs,
          release_date: x.release_date ?? x.metadata?.releaseDate,
          explicit: x.explicit ?? x.metadata?.explicit,
          show: x.show ?? x.metadata?.show,
          external_url: x.external_url ?? x.metadata?.providerUrl,
        }
      : null;
const artist = (x: any) =>
  x
    ? {
        id: x.id,
        uri: x.uri ?? x.metadata?.providerUri,
        name: x.name,
        genres: x.genres ?? x.metadata?.genres,
        popularity: x.popularity ?? x.metadata?.popularity,
        followers: x.followers?.total ?? x.metadata?.followers,
        external_url: x.external_url ?? x.metadata?.providerUrl ?? x.external_urls?.spotify,
      }
    : null;
const album = (x: any) =>
  x
    ? {
        id: x.id,
        uri: x.uri ?? x.metadata?.providerUri,
        name: x.name,
        artists: (x.artists ?? []).map((a: any) => ({ id: a.id, name: a.name })),
        release_date: x.release_date ?? x.metadata?.releaseDate,
        total_tracks: x.total_tracks ?? x.metadata?.totalTracks,
        external_url: x.external_url ?? x.metadata?.providerUrl ?? x.external_urls?.spotify,
      }
    : null;
const compactPage = (p: any, kind: 'track' | 'artist' | 'album') => ({
  ...p,
  items: (p?.items ?? []).map((x: any) =>
    kind === 'track' ? track(x) : kind === 'artist' ? artist(x) : album(x),
  ),
});
const out = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  structuredContent: data,
});
const BASE_REQUIRED_TOOL_NAMES = [
  'search_tracks',
  'search_artists',
  'search_albums',
  'get_track',
  'get_artist',
  'get_artist_top_tracks',
  'get_my_playlists',
  'get_playlist',
  'get_playlist_tracks',
  'create_playlist',
  'add_tracks_to_playlist',
  'remove_tracks_from_playlist',
  'reorder_playlist_tracks',
  'replace_playlist_tracks',
  'update_playlist_details',
  'get_top_tracks',
  'get_top_artists',
  'get_recently_played',
  'get_saved_tracks',
  'save_tracks',
  'remove_saved_tracks',
  'check_saved_tracks',
  'get_currently_playing',
  'get_playback_state',
  'get_devices',
  'play',
  'pause',
  'next_track',
  'previous_track',
  'seek',
  'set_volume',
  'transfer_playback',
  'find_track_exact',
  'remember_track',
  'find_playlist_by_name',
  'add_tracks_by_search',
  'deduplicate_playlist',
  'get_playlist_stats',
  'bulk_add_tracks',
  'create_playlist_from_tracks',
] as const;
const STATE_TOOL_NAMES = [
  'create_bulk_job',
  'get_job_status',
  'list_jobs',
  'resume_job',
  'commit_job',
  'cancel_job',
  'get_state_diagnostics',
  'get_rate_limit_status',
  'get_recent_api_errors',
] as const;
export const REQUIRED_TOOL_NAMES: readonly string[] = new Proxy(
  BASE_REQUIRED_TOOL_NAMES as readonly string[],
  {
    get(target, property, receiver) {
      if (property === 'length')
        return target.length + (isDatabaseInitialized() ? STATE_TOOL_NAMES.length : 0);
      if (property === Symbol.iterator)
        return function* () {
          yield* target;
          if (isDatabaseInitialized()) yield* STATE_TOOL_NAMES;
        };
      return Reflect.get(target, property, receiver);
    },
  },
);
/** Smart Playlist Engine tools are additive; REQUIRED_TOOL_NAMES remains the legacy compatibility registry. */
export const SMART_PLAYLIST_TOOL_NAMES = [
  'playlist_health_report',
  'snapshot_playlist',
  'restore_playlist_snapshot',
  'undo_last_playlist_change',
  'playlist_diff',
  'dry_run_playlist_operation',
  'verify_playlist_integrity',
  'semantic_deduplicate_playlist',
  'smart_shuffle_playlist',
  'balance_artists',
  'limit_artist_share',
  'smart_insert_tracks',
  'optimize_playlist',
] as const;
export const TOOLSET_PROFILES = {
  core: [
    ...BASE_REQUIRED_TOOL_NAMES,
    'get_connections',
    'get_capabilities',
    'preview_playlist_import',
    'import_playlist',
    'export_playlist',
  ],
  playback: [
    'get_currently_playing',
    'get_playback_state',
    'get_devices',
    'play',
    'pause',
    'next_track',
    'previous_track',
    'seek',
    'set_volume',
  ],
  playlists: [
    'get_my_playlists',
    'get_playlist',
    'get_playlist_tracks',
    'create_playlist',
    'add_tracks_to_playlist',
    'remove_tracks_from_playlist',
    'reorder_playlist_tracks',
    'replace_playlist_tracks',
    'update_playlist_details',
  ],
  playlist_power: [
    ...SMART_PLAYLIST_TOOL_NAMES,
    ...PLAYLIST_AUTOMATION_TOOL_NAMES,
    ...PLAYLIST_PERSONALIZATION_TOOL_NAMES,
    'chapterize_playlist',
    'get_playlist_chapters',
    'play_playlist_chapter',
    'resume_playlist_chapter',
  ],
  discovery: [
    'search_tracks',
    'search_artists',
    'search_albums',
    'get_track',
    'get_artist',
    'get_artist_top_tracks',
    'get_top_tracks',
    'get_top_artists',
    'get_recently_played',
    'get_saved_tracks',
    'check_saved_tracks',
    'find_track_exact',
    'remember_track',
  ],
  personalization: [...PLAYLIST_PERSONALIZATION_TOOL_NAMES],
  transfer: [
    'transfer_playback',
    'plan_playlist_transfer',
    'execute_playlist_transfer',
    'sync_playlist_transfer',
  ],
  diagnostics: [
    'get_state_diagnostics',
    'get_rate_limit_status',
    'get_recent_api_errors',
    'get_job_status',
    'list_jobs',
  ],
  dangerous: [
    'create_playlist',
    'add_tracks_to_playlist',
    'remove_tracks_from_playlist',
    'reorder_playlist_tracks',
    'replace_playlist_tracks',
    'update_playlist_details',
    'save_tracks',
    'remove_saved_tracks',
    'play',
    'pause',
    'next_track',
    'previous_track',
    'seek',
    'set_volume',
    'transfer_playback',
    'execute_playlist_transfer',
    'sync_playlist_transfer',
    'execute_playlist_transfer',
    'sync_playlist_transfer',
    'add_tracks_by_search',
    'deduplicate_playlist',
    'bulk_add_tracks',
    'create_playlist_from_tracks',
    'create_bulk_job',
    'resume_job',
    'commit_job',
    'cancel_job',
    'restore_playlist_snapshot',
    'undo_last_playlist_change',
    ...PLAYLIST_AUTOMATION_TOOL_NAMES,
    ...PLAYLIST_PERSONALIZATION_TOOL_NAMES,
  ],
  all: ['*'],
} as const;
export type ToolsetProfile = keyof typeof TOOLSET_PROFILES;
export function toolsetIncludes(profile: ToolsetProfile, name: string): boolean {
  const names = TOOLSET_PROFILES[profile] as readonly string[];
  return names.includes('*') || names.includes(name);
}
export function executionClassForTool(name: string, mutation: boolean): ToolExecutionClass {
  const metadata = getToolSecurityMetadata(name);
  if (!metadata) throw new Error(`TOOL_SECURITY_METADATA_MISSING:${name}`);
  return metadata.executionClass;
}
export { PLAYLIST_AUTOMATION_TOOL_NAMES, PLAYLIST_PERSONALIZATION_TOOL_NAMES };
export function registerTools(
  s: McpServer,
  c: ProviderHttpClient,
  logger?: Logger,
  includeStateTools = false,
  registry?: ProviderRegistry,
  toolset: ToolsetProfile = 'all',
  resolver?: TrackResolutionService,
) {
  const readRegistry = registry ?? createLegacyProviderRegistry(c);
  const reads = new ProviderReadServices(readRegistry);
  const playlists = new PlaylistGateway(readRegistry);
  const routing = (a: any): ReadRoutingOptions & Record<string, unknown> => ({
    connection_id: a.connection_id,
    provider: a.provider,
    preferred_connection_id: a.preferred_connection_id,
    read_fallback: a.read_fallback,
  });
  const readSchema = {
    connection_id: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    preferred_connection_id: z.string().min(1).optional(),
    read_fallback: z.boolean().optional(),
  };
  const writeSchema = {
    connection_id: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    preferred_connection_id: z.string().min(1).optional(),
  };
  const writeTarget = (a: any): PlaylistWriteTarget => ({
    connection_id: a.connection_id,
    provider: a.provider,
    preferred_connection_id: a.preferred_connection_id,
  });
  const withProvenance = (value: any, result: ReadResult<any>) => ({
    ...value,
    provider: result.provenance.provider,
    connection_id: result.provenance.connection_id,
    ...(result.provenance.fallback ? { read_fallback: true } : {}),
  });
  const original = s.registerTool.bind(s);
  /* const legacyPermissionForTool = (name: string) => {
    if (['get_connections', 'get_capabilities'].includes(name)) return 'diagnostics.read';
    if (
      [
        'search_tracks',
        'search_artists',
        'search_albums',
        'get_track',
        'get_artist',
        'get_playlist_stats',
      ].includes(name)
    )
      return 'catalog.read';
    if (
      [
        'get_my_playlists',
        'get_playlist',
        'get_playlist_tracks',
        'get_playlist_chapters',
        'chapterize_playlist',
      ].includes(name)
    )
      return 'playlist.read';
    if (
      [
        'get_top_tracks',
        'get_top_artists',
        'get_recently_played',
        'get_saved_tracks',
        'check_saved_tracks',
        'find_track_exact',
        'remember_track',
      ].includes(name)
    )
      return 'library.read';
    if (['get_currently_playing', 'get_playback_state', 'get_devices'].includes(name))
      return 'playback.read';
    if (['save_tracks', 'remove_saved_tracks'].includes(name)) return 'library.write';
    if (
      [
        'play',
        'pause',
        'next_track',
        'previous_track',
        'seek',
        'set_volume',
        'transfer_playback',
        'play_playlist_chapter',
        'resume_playlist_chapter',
      ].includes(name)
    )
      return 'playback.control';
    if (
      PLAYLIST_PERSONALIZATION_TOOL_NAMES.includes(
        name as (typeof PLAYLIST_PERSONALIZATION_TOOL_NAMES)[number],
      )
    )
      return 'personalization.read';
    if (
      [
        'get_state_diagnostics',
        'get_rate_limit_status',
        'get_recent_api_errors',
        'get_job_status',
        'list_jobs',
      ].includes(name)
    )
      return 'diagnostics.read';
    if (['create_bulk_job', 'resume_job', 'commit_job', 'cancel_job'].includes(name))
      return 'playlist.write';
    if (
      [
        'create_playlist',
        'add_tracks_to_playlist',
        'update_playlist_details',
        'reorder_playlist_tracks',
      ].includes(name)
    )
      return 'playlist.write';
    if (
      [
        'remove_tracks_from_playlist',
        'replace_playlist_tracks',
        'deduplicate_playlist',
        'restore_playlist_snapshot',
        'undo_last_playlist_change',
      ].includes(name)
    )
      return 'playlist.destructive';
    if (name === 'plan_playlist_transfer') return 'transfer.plan';
    if (['execute_playlist_transfer', 'sync_playlist_transfer'].includes(name))
      return 'transfer.execute';
    return undefined;
  }; */
  const permissionForTool = (name: string) => getToolSecurityMetadata(name)?.permission;
  const enforceAccess = (name: string, args: any) => {
    const access = toolContext.get()?.mcpAccess;
    if (!access) return undefined;
    const permission = permissionForTool(name);
    // Access-controlled requests must never treat missing metadata as public.
    // This deliberately fails closed while a tool is being added to the catalog.
    if (!permission) throw new Error('TOOL_SECURITY_METADATA_MISSING');
    if (!access.permissions?.includes(permission)) throw new Error('PERMISSION_NOT_GRANTED');
    if (name === 'get_connections') return undefined;
    const allowed = access.connectionIds ?? [];
    if (!allowed.length) throw new Error('CONNECTION_NOT_GRANTED');
    const requested =
      args?.connection_id ?? args?.source_connection_id ?? args?.destination_connection_id;
    if (requested && !allowed.includes(requested)) throw new Error('CONNECTION_NOT_GRANTED');
    if (requested) return requested;
    const writePermission = [
      'library.write',
      'playlist.write',
      'playlist.destructive',
      'playback.control',
      'transfer.execute',
    ].includes(permission ?? '');
    if (args && !requested && writePermission && allowed.length > 1) {
      const preferred = readRegistry.getPreferred().write;
      if (!preferred || !allowed.includes(preferred)) throw new Error('CONNECTION_NOT_GRANTED');
      args.connection_id = preferred;
      args.read_fallback = false;
      return preferred;
    } else if (args && !requested) {
      args.connection_id = allowed[0];
      args.read_fallback = false;
      return allowed[0];
    }
    return undefined;
  };
  const validateTarget = (a: any) => {
    if (
      a?.provider &&
      a?.connection_id &&
      !readRegistry.connectionMatchesProvider(a.connection_id, a.provider)
    )
      throw new Error('provider_connection_conflict');
  };
  s = {
    registerTool: (name: any, config: any, callback: any) => {
      const registrationMetadata = getToolSecurityMetadata(name);
      if (!registrationMetadata) throw new Error(`TOOL_SECURITY_METADATA_MISSING:${name}`);
      const wrapped = async (...args: any[]) => {
        validateTarget(args[0]);
        const parentContext = toolContext.get();
        const requestId = parentContext?.requestId ?? `req_${globalThis.crypto.randomUUID()}`;
        const controller = new AbortController();
        const metadata = registrationMetadata;
        const classBudget = metadata.executionClass.startsWith('heavy') ? 5 * 60_000 : 15_000;
        const deadlineAt = Math.min(
          parentContext?.deadlineAt ?? Number.POSITIVE_INFINITY,
          Date.now() + classBudget,
        );
        const timer = setTimeout(() => controller.abort(), Math.max(0, deadlineAt - Date.now()));
        const signal = parentContext?.signal
          ? AbortSignal.any([parentContext.signal, controller.signal])
          : controller.signal;
        const started = Date.now();
        let effectiveConnectionId: string | undefined;
        if (isDraining() && !metadata.readOnly) {
          clearTimeout(timer);
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'SERVER_DRAINING',
                  message: 'The server is shutting down.',
                }),
              },
            ],
          };
        }
        try {
          effectiveConnectionId = enforceAccess(name, args[0]);
        } catch (error) {
          const normalized = toApiError(error);
          clearTimeout(timer);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: normalized.code, message: normalized.message }),
              },
            ],
            isError: true,
          };
        }
        logger?.info(
          { event: 'tool.start', request_id: requestId, tool: name },
          'MCP tool started',
        );
        try {
          const result = await toolContext.run(
            {
              requestId,
              signal,
              deadlineAt,
              operation: name,
              mcpAccess:
                effectiveConnectionId && parentContext?.mcpAccess
                  ? { ...parentContext.mcpAccess, connectionIds: [effectiveConnectionId] }
                  : parentContext?.mcpAccess,
              singleflight: parentContext?.singleflight,
            },
            async () =>
              await Promise.race([
                callback(...args),
                new Promise((_, reject) =>
                  signal.addEventListener(
                    'abort',
                    () => reject(new Error('tool_execution_timeout')),
                    { once: true },
                  ),
                ),
              ]),
          );
          logger?.info(
            {
              event: 'tool.success',
              request_id: requestId,
              tool: name,
              duration_ms: Date.now() - started,
            },
            'MCP tool succeeded',
          );
          return result;
        } catch (error) {
          const normalized = toApiError(error);
          logger?.warn(
            {
              event: 'tool.error',
              request_id: requestId,
              tool: name,
              code: normalized.code,
              duration_ms: Date.now() - started,
            },
            'MCP tool failed',
          );
          const details = {
            ...(normalized.details ?? {}),
            ...(error instanceof ProviderApiError
              ? { provider_status: error.status, spotify_status: error.status }
              : {}),
            ...(normalized.retryAfter !== undefined ? { retry_after: normalized.retryAfter } : {}),
            request_id: requestId,
          };
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: {
                    code: normalized.code,
                    message: normalized.message,
                    details,
                    request_id: requestId,
                  },
                }),
              },
            ],
            structuredContent: {
              error: {
                code: normalized.code,
                message: normalized.message,
                details,
                request_id: requestId,
              },
            },
          };
        } finally {
          clearTimeout(timer);
        }
      };
      if (!toolsetIncludes(toolset, name)) return undefined;
      return original(
        name,
        {
          ...config,
          annotations: {
            ...config.annotations,
            readOnlyHint: registrationMetadata.readOnly,
            destructiveHint: registrationMetadata.destructive,
            idempotentHint: registrationMetadata.idempotent,
            openWorldHint: true,
          },
        },
        wrapped,
      );
    },
  } as unknown as McpServer;
  s.registerTool(
    'get_connections',
    {
      title: 'Get provider connections',
      description: 'List compact provider connection summaries without credentials.',
      inputSchema: {},
    },
    async () =>
      out(
        (toolContext.get()?.mcpAccess
          ? readRegistry
              .listConnections()
              .filter((connection) =>
                toolContext.get()?.mcpAccess?.connectionIds?.includes(connection.connectionId),
              )
          : readRegistry.listConnections()
        ).map((connection, index, connections) => {
          const preferred = readRegistry.getPreferred?.() ?? {};
          return {
            connection_id: connection.connectionId,
            provider: connection.provider,
            status: connection.connected === false ? 'disconnected' : 'connected',
            capabilities: connection.capabilities,
            default: connection.connectionId === (preferred.read ?? connections[0]?.connectionId),
            preferred_read: connection.connectionId === preferred.read,
            preferred_write: connection.connectionId === preferred.write,
          };
        }),
      ),
  );
  s.registerTool(
    'plan_playlist_transfer',
    {
      title: 'Plan playlist transfer',
      description:
        'Create an explainable cross-provider transfer plan. Dry-run only; performs zero destination writes.',
      inputSchema: {
        source_connection_id: id,
        source_playlist_id: id,
        destination_connection_id: id,
        destination_provider: id.optional(),
        start_position: z.number().int().min(0).default(0),
        max_tracks: z.number().int().min(1).max(10000).default(10000),
      },
    },
    async (a: any) => {
      const source = readRegistry.getConnection(a.source_connection_id);
      const destination = readRegistry.getConnection(a.destination_connection_id);
      if (!source) throw new Error('source_connection_unavailable');
      if (!destination) throw new Error('destination_connection_unavailable');
      if (a.destination_provider && a.destination_provider !== destination.summary.provider)
        throw new Error('provider_connection_conflict');
      if (!source.playlistRead) throw new Error('source_playlist_read_unsupported');
      const sourceTracks: any[] = [];
      for (let offset = a.start_position; offset < a.start_position + a.max_tracks;) {
        const page: any = await reads.getPlaylistTracks(a.source_playlist_id, {
          connection_id: a.source_connection_id,
          provider: source.summary.provider,
          limit: Math.min(50, a.start_position + a.max_tracks - offset),
          offset,
          read_fallback: false,
        });
        const items = page.data?.items ?? [];
        if (!items.length) break;
        sourceTracks.push(...items);
        offset += items.length;
        if (!page.data?.next) break;
      }
      return out(
        await planPlaylistTransfer({
          sourceTracks,
          sourceProvider: source.summary.provider,
          sourceConnectionId: a.source_connection_id,
          sourcePlaylistId: a.source_playlist_id,
          sourceOffset: a.start_position,
          destinationProvider: destination.summary.provider,
          destinationConnectionId: a.destination_connection_id,
          destinationPlaylistWriteSupported:
            destination.summary.capabilities.playlistWrite === true,
          destinationCatalogSupported: destination.summary.capabilities.catalog === true,
          searchTracks: async (query, options) =>
            (await reads.searchTracks(query, { ...options, read_fallback: false })).data,
          rateLimit: (provider, scope, connectionId) =>
            Boolean(getRateLimit(provider, scope, connectionId)),
        }),
      );
    },
  );
  s.registerTool(
    'execute_playlist_transfer',
    {
      title: 'Execute playlist transfer',
      description:
        'Execute a previously validated transfer plan against the explicitly selected destination. Requires confirmation and verifies the resulting playlist.',
      inputSchema: {
        transfer_plan: z.any(),
        destination_playlist_id: id,
        confirm: z.literal(true),
        resumed: z.boolean().optional(),
      },
    },
    async (a: {
      transfer_plan: TransferPlan;
      destination_playlist_id: string;
      confirm: true;
      resumed?: boolean;
    }) =>
      out(
        await executePlaylistTransfer({
          plan: a.transfer_plan,
          destinationPlaylistId: a.destination_playlist_id,
          registry: readRegistry,
          gateway: playlists,
          resumed: a.resumed,
        }),
      ),
  );
  s.registerTool(
    'sync_playlist_transfer',
    {
      title: 'Synchronize transferred playlist',
      description:
        'Apply an explicitly confirmed provider-neutral sync policy. Destructive cross-provider conflicts fail closed.',
      inputSchema: {
        transfer_plan: z.any(),
        destination_playlist_id: id,
        policy: z.enum(['mirror', 'append_missing', 'remove_extra', 'two_way_union']),
        confirm: z.literal(true),
      },
    },
    async (a: {
      transfer_plan: TransferPlan;
      destination_playlist_id: string;
      policy: TransferSyncPolicy;
      confirm: true;
    }) =>
      out(
        await syncPlaylistTransfer({
          plan: a.transfer_plan,
          destinationPlaylistId: a.destination_playlist_id,
          policy: a.policy,
          registry: readRegistry,
          gateway: playlists,
          confirm: a.confirm,
        }),
      ),
  );
  const importFormat = z.enum(['json', 'csv', 'm3u8', 'txt']);
  for (const name of ['preview_playlist_import', 'import_playlist'] as const)
    s.registerTool(
      name,
      {
        title: name === 'preview_playlist_import' ? 'Preview playlist import' : 'Import playlist',
        description:
          'Parse and validate provider-neutral playlist data. This operation never writes to a provider.',
        inputSchema: { format: importFormat, content: z.string().min(1) },
      },
      async (a: { format: PlaylistFormat; content: string }) =>
        out({ ...parsePlaylistImport(a.content, a.format), write_performed: false }),
    );
  s.registerTool(
    'export_playlist',
    {
      title: 'Export playlist',
      description:
        'Export provider-neutral canonical playlist data without credentials or provider calls.',
      inputSchema: {
        format: importFormat,
        playlist: z.object({
          version: z.literal(1),
          format: z.literal('jamrelay-playlist'),
          tracks: z.array(z.any()),
          name: z.string().optional(),
          description: z.string().optional(),
        }),
      },
    },
    async (a: { format: PlaylistFormat; playlist: PlaylistDocument }) =>
      out({
        format: a.format,
        content: exportPlaylist(a.playlist, a.format),
        write_performed: false,
      }),
  );
  s.registerTool(
    'get_capabilities',
    {
      title: 'Get provider capabilities',
      description: 'Describe supported provider operations and explain unavailable capabilities.',
      inputSchema: {
        provider: z.string().min(1).optional(),
        connection_id: z.string().min(1).optional(),
      },
    },
    async (a: any) => {
      validateTarget(a);
      const connections = readRegistry
        .listConnections()
        .filter((connection) => !a.provider || connection.provider === a.provider)
        .filter((connection) => !a.connection_id || connection.connectionId === a.connection_id);
      return out(
        connections.map((connection) => ({
          connection_id: connection.connectionId,
          provider: connection.provider,
          capabilities: connection.capabilities,
          unsupported_operations: Object.entries(connection.capabilities)
            .filter(([, supported]) => !supported)
            .map(([capability]) => capability),
        })),
      );
    },
  );
  const get = async (path: string) => c.request<any>(path);
  const playlistSnapshot = async (playlistId: string) => {
    const p: any = await get('/playlists/' + playlistId);
    return { snapshot_id: p?.snapshot_id, items: await getAllItems(playlistId) };
  };
  const getAllItems = async (playlistId: string) => {
    const all: any[] = [];
    for (let offset = 0; offset < 10000;) {
      const p: any = await get('/playlists/' + playlistId + '/items?limit=50&offset=' + offset);
      const page = p?.items ?? [];
      if (!page.length) break;
      all.push(...page);
      if (!p.next) break;
      offset += page.length;
    }
    return all;
  };
  const restoreSnapshot = async (playlistId: string, items: any[]) => {
    const uris = items.map((x) => x.item?.uri).filter(Boolean);
    await c.json('/playlists/' + playlistId + '/items', { uris: uris.slice(0, 100) }, 'PUT');
    for (const part of chunks(uris.slice(100)))
      await c.json('/playlists/' + playlistId + '/items', { uris: part });
  };
  const search = (type: 'track' | 'artist' | 'album', a: any) => {
    const options = { ...routing(a), limit: a.limit, offset: 0 };
    return type === 'track'
      ? reads.searchTracks(a.query, options)
      : type === 'artist'
        ? reads.searchArtists(a.query, options)
        : reads.searchAlbums(a.query, options);
  };
  for (const [n, t] of [
    ['search_tracks', 'track'],
    ['search_artists', 'artist'],
    ['search_albums', 'album'],
  ] as const)
    s.registerTool(
      n,
      {
        title: n,
        description: 'Search the selected provider catalog with current pagination.',
        inputSchema: { query: z.string().min(1), limit, ...readSchema },
      },
      async (a: any) => {
        const r = await search(t, a);
        return out(
          withProvenance(
            {
              items: r.data.map((x: any) =>
                t === 'track' ? track(x) : t === 'artist' ? artist(x) : album(x),
              ),
            },
            r,
          ),
        );
      },
    );
  for (const [n, t] of [
    ['get_track', 'track'],
    ['get_artist', 'artist'],
  ])
    s.registerTool(
      n,
      {
        title: n,
        description: 'Get a provider ' + t + ' by ID, URI, or URL.',
        inputSchema: { [t + '_id']: id, ...readSchema },
      },
      async (a: any) => {
        const r =
          t === 'track'
            ? await reads.getTrack(a[t + '_id'], routing(a))
            : await reads.getArtist(a[t + '_id'], routing(a));
        return out(
          r.data ? withProvenance(t === 'track' ? track(r.data) : artist(r.data), r) : null,
        );
      },
    );
  s.registerTool(
    'get_artist_top_tracks',
    {
      title: 'Get artist top tracks',
      description:
        'Spotify removed the official endpoint in February 2026; this tool returns a structured platform limitation.',
      inputSchema: { artist_id: id },
    },
    async () =>
      out({
        ok: false,
        error: {
          type: 'spotify_feature_removed',
          code: 'artist_top_tracks_endpoint_removed',
          message: 'Spotify removed Get Artist Top Tracks in February 2026.',
          removed_by_spotify: true,
        },
      }),
  );
  s.registerTool(
    'get_my_playlists',
    {
      title: 'Get my playlists',
      description:
        'List compact playlists; all=true fetches all pages up to the server safety cap.',
      inputSchema: {
        limit,
        offset: z.number().int().min(0).default(0),
        all: z.boolean().default(false),
        ...readSchema,
      },
    },
    async (a: any) => {
      const compact = (p: any) => ({
        id: p.id,
        uri: p.uri ?? p.metadata?.providerUri,
        name: p.name,
        description: p.description,
        public: p.public,
        collaborative: p.collaborative,
        owner: p.owner?.display_name ?? p.metadata?.owner,
        snapshot_id: p.snapshot_id ?? p.metadata?.providerSnapshotId,
        total_items: p.items?.total ?? p.trackCount,
        external_url: p.external_url ?? p.metadata?.providerUrl ?? p.external_urls?.spotify,
      });
      if (!a.all) {
        const r = await reads.listPlaylists({ ...routing(a), limit: a.limit, offset: a.offset });
        return out(
          withProvenance(
            {
              items: (r.data as any).items.map(compact),
              total: (r.data as any).total,
              limit: (r.data as any).limit,
              offset: (r.data as any).offset,
              next: (r.data as any).next,
            },
            r,
          ),
        );
      }
      let provenance: ReadResult<any> | undefined;
      const pages = await paginate(
        async (offset) => {
          const page = await reads.listPlaylists({ ...routing(a), limit: 50, offset });
          provenance = page;
          return {
            items: (page.data as any).items ?? [],
            next: (page.data as any).next,
            total: (page.data as any).total,
          };
        },
        10000,
        10000,
        a.offset,
      );
      const r = provenance!;
      return out(
        withProvenance({ items: pages.map(compact), total: pages.length, offset: a.offset }, r),
      );
    },
  );
  const pid = (a: any) => parseProviderIdentifier(a.playlist_id, 'spotify', 'playlist').id;
  s.registerTool(
    'get_playlist',
    {
      title: 'Get playlist',
      description: 'Get playlist metadata.',
      inputSchema: { playlist_id: id, ...readSchema },
    },
    async (a: any) => {
      const r = await reads.getPlaylist(a.playlist_id, routing(a));
      const p: any = r.data;
      return out(
        withProvenance(
          {
            id: p.id,
            uri: p.uri,
            name: p.name,
            description: p.description,
            owner: p.owner?.display_name,
            public: p.public,
            collaborative: p.collaborative,
            snapshot_id: p.snapshot_id,
            total_items: p.items?.total,
            external_url: p.external_url ?? p.metadata?.providerUrl ?? p.external_urls?.spotify,
          },
          r,
        ),
      );
    },
  );
  s.registerTool(
    'get_playlist_tracks',
    {
      title: 'Get playlist items',
      description: 'Read normalized playlist items using current /items; maximum page size is 50.',
      inputSchema: {
        playlist_id: id,
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
        ...readSchema,
      },
    },
    async (a: any) => {
      const r = await reads.getPlaylistTracks(a.playlist_id, {
        ...routing(a),
        limit: a.limit,
        offset: a.offset,
      });
      const p: any = r.data;
      return out(
        withProvenance(
          {
            total: p.total,
            limit: p.limit,
            offset: p.offset,
            next: p.next,
            items: (p?.items ?? []).map((x: any) => ({
              added_at: x.added_at ?? x.addedAt,
              item_type: x.item?.type ?? 'unknown',
              item:
                x.item?.type === 'track'
                  ? track(x.item)
                  : x.item
                    ? {
                        id: x.item.id,
                        uri: x.item.uri,
                        name: x.item.name,
                        external_url:
                          x.item.external_url ??
                          x.item.metadata?.providerUrl ??
                          x.item.external_urls?.spotify,
                      }
                    : null,
            })),
          },
          r,
        ),
      );
    },
  );
  s.registerTool(
    'create_playlist',
    {
      title: 'Create playlist',
      description: 'Create a playlist; collaborative playlists must be private.',
      inputSchema: {
        name: z.string().min(1).max(100),
        description: z.string().max(300).optional(),
        public: z.boolean().default(false),
        collaborative: z.boolean().default(false),
        ...writeSchema,
      },
    },
    async (a: any) => {
      if (a.collaborative && a.public)
        throw new Error('A Spotify playlist cannot be both public and collaborative');
      return out(
        await playlists.create(
          {
            name: a.name,
            description: a.description ?? '',
            public: a.public,
            collaborative: a.collaborative,
          },
          writeTarget(a),
        ),
      );
    },
  );
  const uris = (a: any) =>
    a.track_ids.map((x: string) => parseProviderIdentifier(x, 'spotify', 'track').uri);
  s.registerTool(
    'add_tracks_to_playlist',
    {
      title: 'Add tracks',
      description: 'Add tracks sequentially in chunks of at most 100 using /items.',
      inputSchema: { playlist_id: id, track_ids: z.array(id).min(1).max(10000), ...writeSchema },
    },
    async (a: any) => out(await playlists.add(a.playlist_id, a.track_ids, writeTarget(a))),
  );
  s.registerTool(
    'remove_tracks_from_playlist',
    {
      title: 'Remove playlist items',
      description:
        'Remove requested URI occurrences using DELETE /items and return the final snapshot.',
      inputSchema: { playlist_id: id, track_ids: z.array(id).min(1).max(10000), ...writeSchema },
    },
    async (a: any) => {
      const result: any = await playlists.remove(a.playlist_id, a.track_ids, {}, writeTarget(a));
      return out({ ...result, removed_requested: a.track_ids.length });
    },
  );
  s.registerTool(
    'reorder_playlist_tracks',
    {
      title: 'Reorder playlist items',
      description: 'Reorder with current PUT /items payload.',
      inputSchema: {
        playlist_id: id,
        range_start: z.number().int().min(0),
        insert_before: z.number().int().min(0),
        range_length: z.number().int().min(1).default(1),
        snapshot_id: z.string().optional(),
        ...writeSchema,
      },
    },
    async (a: any) =>
      out(
        await playlists.reorder(
          a.playlist_id,
          {
            range_start: a.range_start,
            insert_before: a.insert_before,
            range_length: a.range_length,
            snapshot_id: a.snapshot_id,
          },
          writeTarget(a),
        ),
      ),
  );
  s.registerTool(
    'replace_playlist_tracks',
    {
      title: 'Replace playlist items',
      description:
        'Replace then append ordered chunks, max 100 per request; rolls back after later chunk failure.',
      inputSchema: { playlist_id: id, track_ids: z.array(id).max(10000), ...writeSchema },
    },
    async (a: any) => {
      return out(await playlists.replace(a.playlist_id, a.track_ids, writeTarget(a)));
    },
  );
  s.registerTool(
    'update_playlist_details',
    {
      title: 'Update playlist details',
      description: 'Update playlist metadata; collaborative playlists must be private.',
      inputSchema: {
        playlist_id: id,
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(300).optional(),
        public: z.boolean().optional(),
        collaborative: z.boolean().optional(),
        ...writeSchema,
      },
    },
    async (a: any) => {
      if (a.collaborative === true && a.public !== false) {
        const current: any = await reads.getPlaylist(a.playlist_id, routing(a)).then((x) => x.data);
        if (current?.public !== false)
          throw new Error('A collaborative Spotify playlist must be private');
      }
      const b = { ...a };
      delete b.playlist_id;
      delete b.connection_id;
      delete b.provider;
      delete b.preferred_connection_id;
      return out(await playlists.update(a.playlist_id, b, writeTarget(a)));
    },
  );
  const top = async (type: 'tracks' | 'artists', a: any) => {
    const r =
      type === 'tracks'
        ? await reads.getTopTracks({
            ...routing(a),
            time_range: a.time_range,
            limit: a.limit,
            offset: a.offset,
          })
        : await reads.getTopArtists({
            ...routing(a),
            time_range: a.time_range,
            limit: a.limit,
            offset: a.offset,
          });
    const p: any = r.data;
    return out(
      withProvenance(
        {
          ...p,
          items: (p?.items ?? []).map((x: any) => (type === 'tracks' ? track(x) : artist(x))),
        },
        r,
      ),
    );
  };
  for (const [n, t] of [
    ['get_top_tracks', 'tracks'],
    ['get_top_artists', 'artists'],
  ] as const)
    s.registerTool(
      n,
      {
        title: n,
        description: 'Read personalized top Spotify items; Spotify maximum is 50.',
        inputSchema: {
          time_range: z.enum(['short_term', 'medium_term', 'long_term']).default('medium_term'),
          limit: z.number().int().min(1).max(50).default(20),
          offset: z.number().int().min(0).default(0),
          ...readSchema,
        },
      },
      (a) => top(t, a),
    );
  s.registerTool(
    'get_currently_playing',
    {
      title: 'Get currently playing',
      description:
        'Get the currently playing track or episode; 204 is returned as inactive playback.',
      inputSchema: { ...readSchema },
    },
    async (a: any) => {
      const r = await reads.getCurrentlyPlaying(routing(a));
      const x: any = r.data;
      return out(
        withProvenance(
          {
            playing: x.playing,
            progress_ms: x.progressMs,
            item: playbackItem(x.item),
            item_type: x.itemType,
            context: x.context,
          },
          r,
        ),
      );
    },
  );
  s.registerTool(
    'get_playback_state',
    {
      title: 'Get playback state',
      description: 'Get playback state and normalize either a track or episode item.',
      inputSchema: { ...readSchema },
    },
    async (a: any) => {
      const r = await reads.getPlaybackState(routing(a));
      const x: any = r.data;
      return out(
        x
          ? withProvenance(
              {
                is_playing: x.is_playing ?? x.isPlaying,
                device: x.device
                  ? {
                      id: x.device.id,
                      name: x.device.name,
                      type: x.device.type,
                      volume_percent: x.device.volume_percent ?? x.device.volumePercent,
                    }
                  : null,
                repeat_state: x.repeat_state ?? x.repeatState,
                shuffle_state: x.shuffle_state ?? x.shuffleState,
                progress_ms: x.progress_ms,
                item: playbackItem(x.item),
                context: x.context ? { type: x.context.type, uri: x.context.uri } : undefined,
              },
              r,
            )
          : null,
      );
    },
  );
  s.registerTool(
    'get_devices',
    { title: 'Get devices', description: 'List Spotify Connect devices.', inputSchema: {} },
    async () => {
      const x: any = await get('/me/player/devices');
      return out({
        devices: (x?.devices ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          is_active: d.is_active,
          is_private_session: d.is_private_session,
          is_restricted: d.is_restricted,
          volume_percent: d.volume_percent,
          supports_volume: d.supports_volume,
        })),
      });
    },
  );
  s.registerTool(
    'get_recently_played',
    {
      title: 'Get recently played',
      description: 'Read recent history; before and after cannot be combined.',
      inputSchema: {
        limit: z.number().int().min(1).max(50).default(20),
        before: z.number().int().positive().optional(),
        after: z.number().int().positive().optional(),
        ...readSchema,
      },
    },
    async (a: any) => {
      if (a.before && a.after) throw new Error('before and after are mutually exclusive');
      const q = new URLSearchParams({ limit: String(a.limit) });
      if (a.before) q.set('before', String(a.before));
      if (a.after) q.set('after', String(a.after));
      const r = await reads.getRecentlyPlayed({
        ...routing(a),
        limit: a.limit,
        before: a.before,
        after: a.after,
      });
      const p: any = r.data;
      return out(
        withProvenance(
          {
            ...p,
            items: (p?.items ?? []).map((x: any) => ({
              played_at: x.played_at ?? x.playedAt,
              track: track(x.track),
            })),
          },
          r,
        ),
      );
    },
  );
  s.registerTool(
    'get_saved_tracks',
    {
      title: 'Get saved tracks',
      description: 'Read saved tracks with pagination.',
      inputSchema: {
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
        ...readSchema,
      },
    },
    async (a: any) => {
      const r = await reads.getSavedTracks({ ...routing(a), limit: a.limit, offset: a.offset });
      const p: any = r.data;
      return out(
        withProvenance(
          {
            ...p,
            items: (p?.items ?? []).map((x: any) => ({
              added_at: x.added_at ?? x.addedAt,
              track: track(x.track),
            })),
          },
          r,
        ),
      );
    },
  );
  const verifyPlayerMutation = async (
    operation: () => Promise<unknown>,
    expectedPlaying: boolean,
  ) => {
    try {
      return out(await operation());
    } catch (error) {
      if (error instanceof ProviderApiError && error.status === 403) {
        try {
          const state: any = await c.request('/me/player');
          if (Boolean(state?.is_playing) === expectedPlaying)
            return out({ ok: true, verified_after_error: true, spotify_status: 403 });
        } catch {}
      }
      throw error;
    }
  };
  s.registerTool(
    'pause',
    {
      title: 'pause',
      description:
        'Pause Spotify playback; verifies the resulting state after a 403 restriction response.',
      inputSchema: { device_id: z.string().optional() },
    },
    async (a: any) =>
      verifyPlayerMutation(
        () =>
          c.request(
            '/me/player/pause' +
              (a.device_id ? '?device_id=' + encodeURIComponent(a.device_id) : ''),
            {
              method: 'PUT',
            },
          ),
        false,
      ),
  );
  for (const [n, p] of [
    ['next_track', '/me/player/next'],
    ['previous_track', '/me/player/previous'],
  ] as const)
    s.registerTool(
      n,
      {
        title: n,
        description: 'Control Spotify playback.',
        inputSchema: { device_id: z.string().optional() },
      },
      async (a: any) =>
        out(
          await c.request(
            p + (a.device_id ? '?device_id=' + encodeURIComponent(a.device_id) : ''),
            { method: 'POST' },
          ),
        ),
    );
  s.registerTool(
    'play',
    {
      title: 'Play',
      description:
        'Start or resume playback; context_uri and uris are mutually exclusive. Verifies the resulting state after a 403 restriction response.',
      inputSchema: {
        device_id: z.string().optional(),
        context_uri: z.string().optional(),
        uris: z.array(z.string().min(1)).min(1).max(100).optional(),
        offset: z.object({ position: z.number().int().min(0) }).optional(),
        position_ms: z.number().int().min(0).optional(),
      },
    },
    async (a: any) => {
      if (a.context_uri && a.uris) throw new Error('context_uri and uris cannot be combined');
      if (a.offset && !(a.context_uri || a.uris))
        throw new Error('offset requires context_uri or uris');
      const ur = a.uris?.map((x: string) => parseProviderIdentifier(x, 'spotify', 'track').uri);
      const { device_id, ...b } = a;
      return verifyPlayerMutation(
        () =>
          c.json(
            '/me/player/play' + (device_id ? '?device_id=' + encodeURIComponent(device_id) : ''),
            { ...b, uris: ur },
            'PUT',
          ),
        true,
      );
    },
  );
  s.registerTool(
    'seek',
    {
      title: 'Seek',
      description: 'Seek to a non-negative position.',
      inputSchema: { position_ms: z.number().int().min(0), device_id: z.string().optional() },
    },
    async (a: any) =>
      out(
        await c.request(
          '/me/player/seek?position_ms=' +
            a.position_ms +
            (a.device_id ? '&device_id=' + encodeURIComponent(a.device_id) : ''),
          { method: 'PUT' },
        ),
      ),
  );
  s.registerTool(
    'set_volume',
    {
      title: 'Set volume',
      description: 'Set volume from 0 to 100.',
      inputSchema: {
        volume_percent: z.number().int().min(0).max(100),
        device_id: z.string().optional(),
      },
    },
    async (a: any) =>
      out(
        await c.request(
          '/me/player/volume?volume_percent=' +
            a.volume_percent +
            (a.device_id ? '&device_id=' + encodeURIComponent(a.device_id) : ''),
          { method: 'PUT' },
        ),
      ),
  );
  s.registerTool(
    'transfer_playback',
    {
      title: 'Transfer playback',
      description: 'Transfer playback to a Spotify Connect device.',
      inputSchema: { device_id: id, play: z.boolean().optional() },
    },
    async (a: any) =>
      out(await c.json('/me/player', { device_ids: [a.device_id], play: a.play }, 'PUT')),
  );
  registerAdvanced(s, c, includeStateTools, reads, playlists, resolver ?? createLegacyResolver(c));
}
