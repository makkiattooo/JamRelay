import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { SpotifyClient } from '../spotify/client.js';
import { SpotifyApiError } from '../spotify/errors.js';
import { parseSpotifyIdentifier } from '../spotify/identifiers.js';
import { chunks } from '../utils/chunks.js';
import { normalizeText, resolveCandidates } from '../spotify/normalize.js';
import { paginate } from '../spotify/pagination.js';
import { writeChunks } from '../spotify/write-operation.js';
import { toApiError } from '../http/errors.js';
import { registerAdvanced } from './helpers.js';
import { toolContext } from './context.js';
import type { Logger } from 'pino';
const id = z.string().min(1),
  limit = z.number().int().min(1).max(50).default(20);
const track = (x: any) =>
  x
    ? {
        id: x.id,
        uri: x.uri,
        name: x.name,
        artists: (x.artists ?? []).map((a: any) => ({ id: a.id, name: a.name })),
        album: x.album ? { id: x.album.id, name: x.album.name } : undefined,
        duration_ms: x.duration_ms,
        explicit: x.explicit,
        external_url: x.external_urls?.spotify,
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
  x?.type === 'track' ? track(x) : x?.type === 'episode' ? episode(x) : null;
const artist = (x: any) =>
  x
    ? {
        id: x.id,
        uri: x.uri,
        name: x.name,
        genres: x.genres,
        popularity: x.popularity,
        followers: x.followers?.total,
        external_url: x.external_urls?.spotify,
      }
    : null;
const album = (x: any) =>
  x
    ? {
        id: x.id,
        uri: x.uri,
        name: x.name,
        artists: (x.artists ?? []).map((a: any) => ({ id: a.id, name: a.name })),
        release_date: x.release_date,
        total_tracks: x.total_tracks,
        external_url: x.external_urls?.spotify,
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
export const REQUIRED_TOOL_NAMES = [
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
  'find_playlist_by_name',
  'add_tracks_by_search',
  'deduplicate_playlist',
  'get_playlist_stats',
  'bulk_add_tracks',
  'create_playlist_from_tracks',
] as const;
export function registerTools(
  s: McpServer,
  c: SpotifyClient,
  logger?: Logger,
  includeStateTools = false,
) {
  const original = s.registerTool.bind(s);
  const mutations = new Set([
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
    'add_tracks_by_search',
    'deduplicate_playlist',
    'bulk_add_tracks',
    'create_playlist_from_tracks',
  ]);
  s = {
    registerTool: (name: any, config: any, callback: any) => {
      const wrapped = async (...args: any[]) => {
        const parentContext = toolContext.get();
        const requestId = parentContext?.requestId ?? `req_${globalThis.crypto.randomUUID()}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const started = Date.now();
        logger?.info(
          { event: 'tool.start', request_id: requestId, tool: name },
          'MCP tool started',
        );
        try {
          const result = await toolContext.run(
            {
              requestId,
              signal: controller.signal,
              deadlineAt: parentContext?.deadlineAt ?? Date.now() + 15000,
            },
            async () =>
              await Promise.race([
                callback(...args),
                new Promise((_, reject) =>
                  controller.signal.addEventListener(
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
            ...(error instanceof SpotifyApiError ? { spotify_status: error.status } : {}),
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
      return original(
        name,
        {
          ...config,
          annotations: {
            ...config.annotations,
            readOnlyHint: !mutations.has(name),
            destructiveHint: [
              'remove_tracks_from_playlist',
              'replace_playlist_tracks',
              'deduplicate_playlist',
              'remove_saved_tracks',
            ].includes(name),
            idempotentHint: [
              'get_track',
              'get_artist',
              'get_playlist',
              'get_playback_state',
              'get_devices',
            ].includes(name),
            openWorldHint: true,
          },
        },
        wrapped,
      );
    },
  } as unknown as McpServer;
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
  const search = async (type: 'track' | 'artist' | 'album', a: any) => {
    const all: any[] = [];
    for (let offset = 0; all.length < a.limit; offset += 10) {
      const p = await get(
        '/search?' +
          new URLSearchParams({
            q: a.query,
            type,
            limit: String(Math.min(10, a.limit - all.length)),
            offset: String(offset),
          }),
      );
      const k = type + 's';
      const items: any[] = p?.[k]?.items ?? [];
      all.push(...items);
      if (items.length < 10 || !p?.[k]?.next) break;
    }
    return out({ items: all.slice(0, a.limit) });
  };
  const searchResult = (type: 'track' | 'artist' | 'album', x: any) =>
    type === 'track' ? track(x) : type === 'artist' ? artist(x) : album(x);
  for (const [n, t] of [
    ['search_tracks', 'track'],
    ['search_artists', 'artist'],
    ['search_albums', 'album'],
  ] as const)
    s.registerTool(
      n,
      {
        title: n,
        description: 'Search Spotify catalog with current pagination.',
        inputSchema: { query: z.string().min(1), limit },
      },
      async (a: any) => {
        const r: any = await search(t, a);
        const parsed = JSON.parse(r.content[0].text);
        return out({ ...parsed, items: parsed.items.map((x: any) => searchResult(t, x)) });
      },
    );
  for (const [n, p, t] of [
    ['get_track', '/tracks/', 'track'],
    ['get_artist', '/artists/', 'artist'],
  ])
    s.registerTool(
      n,
      {
        title: n,
        description: 'Get a Spotify ' + t + ' by ID, URI, or URL.',
        inputSchema: { [t + '_id']: id },
      },
      async (a: any) => {
        const x = await get(p + parseSpotifyIdentifier(a[t + '_id'], t as any).id);
        return out(t === 'track' ? track(x) : artist(x));
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
      },
    },
    async (a: any) => {
      const compact = (p: any) => ({
        id: p.id,
        uri: p.uri,
        name: p.name,
        description: p.description,
        public: p.public,
        collaborative: p.collaborative,
        owner: p.owner?.display_name,
        snapshot_id: p.snapshot_id,
        total_items: p.items?.total,
        external_url: p.external_urls?.spotify,
      });
      if (!a.all) {
        const p: any = await get(
          '/me/playlists?limit=' + Math.min(50, a.limit) + '&offset=' + a.offset,
        );
        return out({ ...p, items: (p.items ?? []).map(compact) });
      }
      const items = await paginate(
        async (o) => {
          const p: any = await get('/me/playlists?limit=50&offset=' + o);
          return { items: p.items ?? [], next: p.next, total: p.total };
        },
        10000,
        10000,
        a.offset,
      );
      return out({ items: items.map(compact), total: items.length, offset: a.offset });
    },
  );
  const pid = (a: any) => parseSpotifyIdentifier(a.playlist_id, 'playlist').id;
  s.registerTool(
    'get_playlist',
    {
      title: 'Get playlist',
      description: 'Get playlist metadata.',
      inputSchema: { playlist_id: id },
    },
    async (a: any) => {
      const p = await get('/playlists/' + pid(a));
      return out({
        id: p.id,
        uri: p.uri,
        name: p.name,
        description: p.description,
        owner: p.owner?.display_name,
        public: p.public,
        collaborative: p.collaborative,
        snapshot_id: p.snapshot_id,
        total_items: p.items?.total,
        external_url: p.external_urls?.spotify,
      });
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
      },
    },
    async (a: any) => {
      const p: any = await get(
        '/playlists/' + pid(a) + '/items?limit=' + a.limit + '&offset=' + a.offset,
      );
      return out({
        ...p,
        items: (p?.items ?? []).map((x: any) => ({
          added_at: x.added_at,
          item_type: x.item?.type ?? 'unknown',
          item:
            x.item?.type === 'track'
              ? track(x.item)
              : x.item
                ? {
                    id: x.item.id,
                    uri: x.item.uri,
                    name: x.item.name,
                    external_url: x.item.external_urls?.spotify,
                  }
                : null,
        })),
      });
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
      },
    },
    async (a: any) => {
      if (a.collaborative && a.public)
        throw new Error('A Spotify playlist cannot be both public and collaborative');
      return out(
        await c.json('/me/playlists', {
          name: a.name,
          description: a.description ?? '',
          public: a.public,
          collaborative: a.collaborative,
        }),
      );
    },
  );
  const uris = (a: any) => a.track_ids.map((x: string) => parseSpotifyIdentifier(x, 'track').uri);
  s.registerTool(
    'add_tracks_to_playlist',
    {
      title: 'Add tracks',
      description: 'Add tracks sequentially in chunks of at most 100 using /items.',
      inputSchema: { playlist_id: id, track_ids: z.array(id).min(1).max(10000) },
    },
    async (a: any) =>
      out(
        await writeChunks('add_tracks_to_playlist', pid(a), uris(a), async (part) =>
          c.json('/playlists/' + pid(a) + '/items', { uris: part }),
        ),
      ),
  );
  s.registerTool(
    'remove_tracks_from_playlist',
    {
      title: 'Remove playlist items',
      description:
        'Remove requested URI occurrences using DELETE /items and return the final snapshot.',
      inputSchema: { playlist_id: id, track_ids: z.array(id).min(1).max(10000) },
    },
    async (a: any) => {
      let snapshot_id = (await playlistSnapshot(pid(a))).snapshot_id;
      const result = await writeChunks<string>(
        'remove_tracks_from_playlist',
        pid(a),
        uris(a),
        async (part) => {
          const r: any = await c.request('/playlists/' + pid(a) + '/items', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: part.map((uri) => ({ uri })), snapshot_id }),
          });
          if (r?.snapshot_id) snapshot_id = r.snapshot_id;
          return r;
        },
      );
      return out({
        ...result,
        last_snapshot_id: result.last_snapshot_id ?? snapshot_id,
        removed_requested: a.track_ids.length,
      });
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
      },
    },
    async (a: any) =>
      out(
        await c.json(
          '/playlists/' + pid(a) + '/items',
          {
            range_start: a.range_start,
            insert_before: a.insert_before,
            range_length: a.range_length,
            snapshot_id: a.snapshot_id,
          },
          'PUT',
        ),
      ),
  );
  s.registerTool(
    'replace_playlist_tracks',
    {
      title: 'Replace playlist items',
      description:
        'Replace then append ordered chunks, max 100 per request; rolls back after later chunk failure.',
      inputSchema: { playlist_id: id, track_ids: z.array(id).max(10000) },
    },
    async (a: any) => {
      const idValue = pid(a),
        original = await playlistSnapshot(idValue),
        u = uris(a);
      return out(
        await writeChunks(
          'replace_playlist_tracks',
          idValue,
          u,
          async (part, index) =>
            c.json(
              '/playlists/' + idValue + '/items',
              { uris: part },
              index === 0 ? 'PUT' : 'POST',
            ),
          { writeEmpty: true, rollback: () => restoreSnapshot(idValue, original.items) },
        ),
      );
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
      },
    },
    async (a: any) => {
      if (a.collaborative === true && a.public !== false) {
        const current: any = await get('/playlists/' + pid(a));
        if (current?.public !== false)
          throw new Error('A collaborative Spotify playlist must be private');
      }
      const b = { ...a };
      delete b.playlist_id;
      return out(await c.json('/playlists/' + pid(a), b, 'PUT'));
    },
  );
  const top = async (type: 'tracks' | 'artists', a: any) => {
    const p: any = await get(
      '/me/top/' +
        type +
        '?time_range=' +
        a.time_range +
        '&limit=' +
        a.limit +
        '&offset=' +
        a.offset,
    );
    return out({
      ...p,
      items: (p?.items ?? []).map((x: any) => (type === 'tracks' ? track(x) : artist(x))),
    });
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
      inputSchema: {},
    },
    async () => {
      const x: any = await get('/me/player/currently-playing');
      return out(
        x
          ? {
              playing: Boolean(x.is_playing),
              progress_ms: x.progress_ms,
              item: playbackItem(x.item),
              item_type: x.currently_playing_type,
              context: x.context ? { type: x.context.type, uri: x.context.uri } : undefined,
            }
          : { playing: false, item: null },
      );
    },
  );
  s.registerTool(
    'get_playback_state',
    {
      title: 'Get playback state',
      description: 'Get playback state and normalize either a track or episode item.',
      inputSchema: {},
    },
    async () => {
      const x: any = await get('/me/player');
      return out(
        x
          ? {
              is_playing: x.is_playing,
              device: x.device
                ? {
                    id: x.device.id,
                    name: x.device.name,
                    type: x.device.type,
                    volume_percent: x.device.volume_percent,
                  }
                : null,
              repeat_state: x.repeat_state,
              shuffle_state: x.shuffle_state,
              progress_ms: x.progress_ms,
              item: playbackItem(x.item),
              context: x.context ? { type: x.context.type, uri: x.context.uri } : undefined,
            }
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
      },
    },
    async (a: any) => {
      if (a.before && a.after) throw new Error('before and after are mutually exclusive');
      const q = new URLSearchParams({ limit: String(a.limit) });
      if (a.before) q.set('before', String(a.before));
      if (a.after) q.set('after', String(a.after));
      const p: any = await get('/me/player/recently-played?' + q);
      return out({
        ...p,
        items: (p?.items ?? []).map((x: any) => ({
          played_at: x.played_at,
          track: track(x.track),
        })),
      });
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
      },
    },
    async (a: any) => {
      const p: any = await get('/me/tracks?limit=' + a.limit + '&offset=' + a.offset);
      return out({
        ...p,
        items: (p?.items ?? []).map((x: any) => ({ added_at: x.added_at, track: track(x.track) })),
      });
    },
  );
  const verifyPlayerMutation = async (
    operation: () => Promise<unknown>,
    expectedPlaying: boolean,
  ) => {
    try {
      return out(await operation());
    } catch (error) {
      if (error instanceof SpotifyApiError && error.status === 403) {
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
      const ur = a.uris?.map((x: string) => parseSpotifyIdentifier(x, 'track').uri);
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
  registerAdvanced(s, c, includeStateTools);
}
