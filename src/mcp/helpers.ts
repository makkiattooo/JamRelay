import * as z from 'zod/v4';
import { SpotifyClient } from '../spotify/client.js';
import { parseSpotifyIdentifier } from '../spotify/identifiers.js';
import { chunks } from '../utils/chunks.js';
import { normalizeText, resolveCandidates } from '../music/normalize.js';
import { writeChunks, writePlaylistOrder } from '../spotify/write-operation.js';
import { TrackResolver } from '../spotify/resolver.js';
import {
  cancelJob,
  createJob,
  getJob,
  getJobItems,
  listJobs,
  listStateDiagnostics,
  setJobStatus,
  updateJobItem,
  updateJobPayload,
} from '../db/jobs.js';
import { isDatabaseInitialized } from '../db/database.js';
import { SpotifyApiError } from '../spotify/errors.js';
import { getRateLimit, getRateLimitStatus, getRecentApiErrors } from '../db/state.js';
import { normalizePlaylistItems, fingerprint } from '../playlists/normalize.js';
import { healthReport, semanticDuplicateGroups } from '../playlists/analyzer.js';
import { seededShuffle, violations } from '../playlists/shuffle.js';
import { makePlan } from '../playlists/planner.js';
import {
  saveSnapshot,
  loadSnapshot,
  latestOperation,
  saveOperation,
} from '../playlists/snapshots.js';
import type { NormalizedPlaylistTrack } from '../playlists/types.js';
import { PlaylistChapterEngine } from '../playlists/chapter-engine.js';
import { registerPlaylistAutomationTools } from '../playlists/automation.js';
import { registerPlaylistPersonalizationTools } from '../playlists/personalization.js';
import type { ProviderReadServices } from '../providers/read-services.js';
import type { PlaylistGateway } from '../providers/playlist-gateway.js';
import { PlaylistGateway as PlaylistGatewayImpl } from '../providers/playlist-gateway.js';
import { ProviderRegistry } from '../providers/registry.js';
import { SpotifyProviderAdapter } from '../spotify/provider-adapter.js';
const id = z.string().min(1);
const text = (x: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(x) }],
  structuredContent: x,
});
const tid = (x: string) => parseSpotifyIdentifier(x, 'track');
function compact(x: any) {
  return {
    id: x.id,
    uri: x.uri,
    name: x.name,
    artists: (x.artists ?? []).map((a: any) => ({ id: a.id, name: a.name })),
    album: x.album
      ? { id: x.album.id, name: x.album.name, release_date: x.album.release_date }
      : undefined,
    duration_ms: x.duration_ms,
    explicit: x.explicit,
    external_url: x.external_urls?.spotify,
  };
}
export function registerAdvanced(
  s: any,
  c: SpotifyClient,
  includeStateTools = isDatabaseInitialized(),
  reads?: ProviderReadServices,
  playlists?: PlaylistGateway,
) {
  const resolver = new TrackResolver(c);
  const get = (p: string) => c.request<any>(p);
  const pid = (a: any) => parseSpotifyIdentifier(a.playlist_id, 'playlist').id;
  const allPlaylistItems = async (idValue: string) => {
    const all: any[] = [];
    const seen = new Set<number>();
    for (let offset = 0; offset < 10000;) {
      if (seen.has(offset)) break;
      seen.add(offset);
      const p: any = await get('/playlists/' + idValue + '/items?limit=50&offset=' + offset);
      const page = p?.items ?? [];
      if (!page.length) break;
      all.push(...page);
      if (!p?.next || page.length === 0) break;
      offset += page.length;
    }
    return all;
  };
  const allPlaylists = async () => {
    const all: any[] = [];
    const seen = new Set<number>();
    for (let offset = 0; offset < 10000;) {
      if (seen.has(offset)) break;
      seen.add(offset);
      const p: any = await get('/me/playlists?limit=50&offset=' + offset);
      const page = p?.items ?? [];
      if (!page.length) break;
      all.push(...page);
      if (!p?.next) break;
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
  const playlistState = async (playlistId: string) => {
    const meta: any = await get('/playlists/' + playlistId);
    const raw = await allPlaylistItems(playlistId),
      normalized = normalizePlaylistItems(raw);
    return { meta, raw, ...normalized };
  };
  const chapterEngine = new PlaylistChapterEngine(c, async (playlistId) => {
    const state = await playlistState(playlistId);
    return { meta: state.meta, raw: state.raw };
  });
  const stateSnapshot = (
    playlistId: string,
    state: { meta: any; tracks: NormalizedPlaylistTrack[] },
    reason: string,
  ) =>
    saveSnapshot({
      playlistId,
      providerId: 'spotify',
      connectionId: 'spotify-default',
      providerPlaylistId: playlistId,
      providerRevision: state.meta?.snapshot_id,
      metadata: {
        id: state.meta?.id,
        name: state.meta?.name,
        description: state.meta?.description,
        public: state.meta?.public,
        collaborative: state.meta?.collaborative,
      },
      uris: state.tracks.flatMap((t) => (t.uri ? [t.uri] : [])),
      reason,
    });
  const replaceUris = async (playlistId: string, uris: string[]) => {
    const result = await writePlaylistOrder({
      playlistId,
      orderedTrackUris: uris,
      replace: (part) => c.json('/playlists/' + playlistId + '/items', { uris: part }, 'PUT'),
      append: (part) => c.json('/playlists/' + playlistId + '/items', { uris: part }),
    });
    if (!result.ok) throw new Error(result.error ?? 'playlist_write_failed');
  };
  const operationPlan = (
    playlistId: string,
    operation: string,
    before: NormalizedPlaylistTrack[],
    after: NormalizedPlaylistTrack[],
    warnings: string[] = [],
    metrics: Record<string, unknown> = {},
  ) =>
    makePlan({
      playlistId,
      operation,
      before,
      after,
      warnings,
      metrics,
      removals: before
        .filter((x) => !after.some((y) => y.uri === x.uri))
        .map((x) => ({ uri: x.uri!, position: x.position })),
    });
  const planOutput = (plan: any) => text({ ...plan, resultingTrackCount: plan.expectedTrackCount });
  const executePlan = async (
    playlistId: string,
    operation: string,
    state: any,
    after: NormalizedPlaylistTrack[],
    plan: any,
  ) => {
    const apiBefore = c.getApiCallMetrics();
    const startedAt = Date.now();
    const safety = stateSnapshot(playlistId, state, operation.toUpperCase());
    try {
      await replaceUris(playlistId, after.map((x) => x.uri!).filter(Boolean));
      const verify: any = await playlistState(playlistId);
      const ok =
        verify.tracks.length === after.length &&
        fingerprint(verify.tracks.map((x: NormalizedPlaylistTrack) => x.uri)) ===
          fingerprint(after.map((x) => x.uri));
      if (!ok) throw new Error('playlist_integrity_mismatch');
      const afterSnapshot = stateSnapshot(playlistId, verify, operation + '_after');
      saveOperation({
        id: plan.id,
        playlistId,
        operation,
        beforeSnapshotId: safety.id,
        afterSnapshotId: afterSnapshot.id,
        plan,
        status: 'completed',
        providerId: safety.providerId,
        connectionId: safety.connectionId,
      });
      return {
        plan,
        safety_snapshot_id: safety.id,
        after_snapshot_id: afterSnapshot.id,
        verification: { ok, count: verify.tracks.length },
        spotify_api_calls: c.getApiCallDelta(apiBefore),
        duration_ms: Date.now() - startedAt,
      };
    } catch (error) {
      let rollbackAttempted = false;
      let rollbackSucceeded = false;
      let rollbackError: string | undefined;
      try {
        rollbackAttempted = true;
        await restoreSnapshot(playlistId, state.raw);
        rollbackSucceeded = true;
      } catch (rollbackFailure) {
        rollbackError = String(rollbackFailure);
      }
      saveOperation({
        id: plan.id,
        playlistId,
        operation,
        beforeSnapshotId: safety.id,
        plan,
        status: 'partial_failure',
        providerId: safety.providerId,
        connectionId: safety.connectionId,
      });
      return {
        plan,
        safety_snapshot_id: safety.id,
        partial_failure: {
          completed: false,
          error: String(error),
          rollback_attempted: rollbackAttempted,
          rollback_succeeded: rollbackSucceeded,
          rollback_error: rollbackError,
        },
        spotify_api_calls: c.getApiCallDelta(apiBefore),
        duration_ms: Date.now() - startedAt,
      };
    }
  };
  const mutationSchema = { playlist_id: id, dry_run: z.boolean().default(true) };
  s.registerTool(
    'playlist_health_report',
    {
      title: 'Playlist health report',
      description: 'Read-only deterministic playlist health analysis; never mutates a provider.',
      inputSchema: { playlist_id: id },
    },
    async (a: any) => {
      const x = await playlistState(pid(a));
      return text({
        ...healthReport(x.tracks, x.unavailable),
        suspectedSemanticDuplicateGroups: semanticDuplicateGroups(x.tracks),
      });
    },
  );
  s.registerTool(
    'snapshot_playlist',
    {
      title: 'Snapshot playlist',
      description: 'Persist an ordered playlist snapshot; requires the state database.',
      inputSchema: { playlist_id: id, reason: z.string().max(200).optional() },
    },
    async (a: any) => {
      const x = await playlistState(pid(a)),
        snap = stateSnapshot(pid(a), x, a.reason ?? 'manual');
      return text({
        snapshot_id: snap.id,
        playlist_id: snap.playlistId,
        provider_revision: snap.providerRevision,
        spotify_snapshot_id: snap.spotifySnapshotId,
        provider_id: snap.providerId,
        connection_id: snap.connectionId,
        track_count: snap.trackCount,
        created_at: snap.createdAt,
      });
    },
  );
  s.registerTool(
    'semantic_deduplicate_playlist',
    {
      title: 'Semantic deduplicate playlist',
      description:
        'Conservative deterministic deduplication. dry_run defaults true; execution snapshots and verifies.',
      inputSchema: {
        ...mutationSchema,
        prefer_original: z.boolean().default(true),
        remove_remasters: z.boolean().default(false),
        remove_live: z.boolean().default(false),
        remove_remixes: z.boolean().default(false),
        remove_sped_up: z.boolean().default(true),
        remove_slowed: z.boolean().default(true),
        duration_tolerance_ms: z.number().int().min(0).max(10000).default(2500),
      },
    },
    async (a: any) => {
      const x = await playlistState(pid(a)),
        groups = semanticDuplicateGroups(x.tracks, a),
        remove = new Set(groups.flatMap((g) => g.removable.map((t) => t.uri))),
        after = x.tracks.filter((t) => !remove.has(t.uri)),
        plan = operationPlan(pid(a), 'semantic_deduplicate', x.tracks, after, [], {
          groups: groups.length,
        });
      return a.dry_run
        ? text({ ...plan, duplicate_groups: groups })
        : text({
            ...(await executePlan(pid(a), 'semantic_deduplicate', x, after, plan)),
            duplicate_groups: groups,
          });
    },
  );
  const layout = async (
    name: string,
    a: any,
    strategy: (tracks: NormalizedPlaylistTrack[]) => NormalizedPlaylistTrack[],
  ) => {
    const x = await playlistState(pid(a)),
      after = strategy(x.tracks),
      plan = operationPlan(pid(a), name, x.tracks, after, [], {
        beforeViolations: violations(x.tracks, a.min_artist_gap ?? 1, a.min_album_gap ?? 0),
        afterViolations: violations(after, a.min_artist_gap ?? 1, a.min_album_gap ?? 0),
      });
    return a.dry_run ? planOutput(plan) : text(await executePlan(pid(a), name, x, after, plan));
  };
  s.registerTool(
    'smart_shuffle_playlist',
    {
      title: 'Smart shuffle playlist',
      description: 'Deterministic seeded spacing layout; dry_run defaults true.',
      inputSchema: {
        ...mutationSchema,
        min_artist_gap: z.number().int().min(0).max(100).default(1),
        min_album_gap: z.number().int().min(0).max(100).optional(),
        seed: z.number().int().optional(),
        preserve_first_n: z.number().int().min(0).max(100).default(0),
        preserve_last_n: z.number().int().min(0).max(100).default(0),
      },
    },
    async (a: any) => layout('smart_shuffle', a, (t) => seededShuffle(t, a)),
  );
  s.registerTool(
    'balance_artists',
    {
      title: 'Balance artists',
      description: 'Reorder without removing tracks; dry_run defaults true.',
      inputSchema: {
        ...mutationSchema,
        min_artist_gap: z.number().int().min(0).max(100).default(1),
        strategy: z.enum(['even', 'preserve_rough_order']).default('even'),
      },
    },
    async (a: any) =>
      layout('balance_artists', a, (t) =>
        seededShuffle(t, { minArtistGap: a.min_artist_gap, seed: 1 }),
      ),
  );
  s.registerTool(
    'restore_playlist_snapshot',
    {
      title: 'Restore playlist snapshot',
      description:
        'Restore exact ordered content from a durable snapshot; creates a PRE-RESTORE safety snapshot.',
      inputSchema: {
        snapshot_id: id,
        dry_run: z.boolean().default(false),
        connection_id: id.optional(),
        provider: id.optional(),
      },
    },
    async (a: any) => {
      const snap = loadSnapshot(a.snapshot_id);
      if (
        (a.connection_id && a.connection_id !== snap.connectionId) ||
        (a.provider && a.provider !== snap.providerId)
      )
        throw Object.assign(new Error('Cross-provider snapshot restore is not permitted.'), {
          code: 'snapshot_target_mismatch',
        });
      const x = await playlistState(snap.playlistId),
        after = snap.uris.map(
          (uri, position) =>
            ({ uri, position, originalIndex: position, id: uri.split(':').pop() }) as any,
        ),
        plan = operationPlan(snap.playlistId, 'restore_snapshot', x.tracks, after);
      return a.dry_run
        ? planOutput(plan)
        : text(await executePlan(snap.playlistId, 'restore_snapshot', x, after, plan));
    },
  );
  s.registerTool(
    'undo_last_playlist_change',
    {
      title: 'Undo last playlist change',
      description:
        'Restore the latest completed JamRelay-managed reversible operation only; dry_run defaults true.',
      inputSchema: { ...mutationSchema, connection_id: id.optional(), provider: id.optional() },
    },
    async (a: any) => {
      const op = latestOperation(pid(a), a.connection_id, a.provider);
      if (!op)
        throw Object.assign(new Error('No reversible JamRelay playlist operation exists.'), {
          code: 'no_reversible_operation',
        });
      return text(
        await (async () => {
          const snap = loadSnapshot(op.before_snapshot_id);
          if (
            (a.connection_id && a.connection_id !== snap.connectionId) ||
            (a.provider && a.provider !== snap.providerId)
          )
            throw Object.assign(new Error('Cross-provider snapshot restore is not permitted.'), {
              code: 'snapshot_target_mismatch',
            });
          const x = await playlistState(pid(a)),
            after = snap.uris.map(
              (uri, position) =>
                ({ uri, position, originalIndex: position, id: uri.split(':').pop() }) as any,
            ),
            plan = operationPlan(pid(a), 'undo', x.tracks, after);
          return a.dry_run ? plan : executePlan(pid(a), 'undo', x, after, plan);
        })(),
      );
    },
  );
  s.registerTool(
    'playlist_diff',
    {
      title: 'Playlist diff',
      description: 'Read-only linear diff between a playlist and a durable snapshot.',
      inputSchema: { playlist_id: id, snapshot_id: id },
    },
    async (a: any) => {
      const snap = loadSnapshot(a.snapshot_id),
        x = await playlistState(pid(a)),
        before = snap.uris,
        after = x.tracks.map((t) => t.uri!),
        beforeSet = new Set(before),
        afterSet = new Set(after);
      return text({
        before_count: before.length,
        after_count: after.length,
        added_tracks: after.filter((u) => !beforeSet.has(u)),
        removed_tracks: before.filter((u) => !afterSet.has(u)),
        moved_tracks: after
          .map((uri, position) => ({ uri, from: before.indexOf(uri), to: position }))
          .filter((m) => m.from >= 0 && m.from !== m.to),
        unchanged_count: after.filter((u) => beforeSet.has(u)).length,
        summary: 'URI-based diff; duplicate occurrences are preserved by position.',
      });
    },
  );
  s.registerTool(
    'dry_run_playlist_operation',
    {
      title: 'Dry run playlist operation',
      description:
        'Read-only planner for supported smart playlist operations; performs zero Spotify writes.',
      inputSchema: {
        playlist_id: id,
        operation: z.enum([
          'semantic_deduplicate',
          'smart_shuffle',
          'balance_artists',
          'limit_artist_share',
          'smart_insert',
          'optimize',
        ]),
        max_artist_share: z.number().min(0).max(1).optional(),
        min_artist_gap: z.number().int().min(0).max(100).default(1),
        min_album_gap: z.number().int().min(0).max(100).optional(),
        seed: z.number().int().optional(),
      },
    },
    async (a: any) => {
      const x = await playlistState(pid(a));
      let after = x.tracks;
      if (a.operation === 'semantic_deduplicate') {
        const rm = new Set(
          semanticDuplicateGroups(after).flatMap((g) => g.removable.map((t) => t.uri)),
        );
        after = after.filter((t) => !rm.has(t.uri));
      } else if (
        a.operation === 'smart_shuffle' ||
        a.operation === 'balance_artists' ||
        a.operation === 'optimize'
      )
        after = seededShuffle(after, {
          seed: a.seed,
          minArtistGap: a.min_artist_gap,
          minAlbumGap: a.min_album_gap,
        });
      return planOutput(operationPlan(pid(a), a.operation, x.tracks, after));
    },
  );
  s.registerTool(
    'verify_playlist_integrity',
    {
      title: 'Verify playlist integrity',
      description:
        'Read-only verification of playlist readability, count, content and optional snapshot state.',
      inputSchema: {
        playlist_id: id,
        expected_snapshot_id: id.optional(),
        operation_plan_id: id.optional(),
      },
    },
    async (a: any) => {
      const x = await playlistState(pid(a)),
        checks: any[] = [
          { name: 'readable', ok: true },
          {
            name: 'track_count',
            ok: x.tracks.length === x.raw.length,
            actual: x.tracks.length,
            raw: x.raw.length,
          },
        ];
      if (a.expected_snapshot_id) {
        const s = loadSnapshot(a.expected_snapshot_id);
        checks.push({
          name: 'ordered_content',
          ok: fingerprint(s.uris) === fingerprint(x.tracks.map((t) => t.uri!)),
        });
      }
      return text({
        ok: checks.every((c) => c.ok),
        checks,
        warnings: x.unavailable ? [`${x.unavailable} unavailable items`] : [],
        mismatches: checks.filter((c) => !c.ok),
      });
    },
  );
  s.registerTool(
    'limit_artist_share',
    {
      title: 'Limit artist share',
      description: 'Plan or execute deterministic artist-share removals; dry_run defaults true.',
      inputSchema: {
        ...mutationSchema,
        max_share: z.number().min(0).max(1).optional(),
        max_tracks_per_artist: z.number().int().min(1).max(10000).optional(),
        selection_strategy: z
          .enum(['keep_earliest', 'spread_across_playlist', 'prefer_unique_albums'])
          .default('keep_earliest'),
      },
    },
    async (a: any) => {
      if (a.max_share == null && a.max_tracks_per_artist == null)
        throw new Error('At least one artist limit is required.');
      const x = await playlistState(pid(a)),
        counts = new Map<string, number>(),
        remove = new Set<string>();
      x.tracks.forEach((t) =>
        counts.set(t.normalizedArtist, (counts.get(t.normalizedArtist) ?? 0) + 1),
      );
      const cap = (artist: string) =>
        Math.min(
          a.max_tracks_per_artist ?? Infinity,
          a.max_share == null ? Infinity : Math.floor(x.tracks.length * a.max_share),
        );
      counts.forEach((n, artist) => {
        let keep = cap(artist);
        for (const t of x.tracks)
          if (t.normalizedArtist === artist && keep-- <= 0 && t.uri) remove.add(t.uri);
      });
      const after = x.tracks.filter((t) => !t.uri || !remove.has(t.uri)),
        plan = operationPlan(pid(a), 'limit_artist_share', x.tracks, after);
      return a.dry_run
        ? planOutput(plan)
        : text(await executePlan(pid(a), 'limit_artist_share', x, after, plan));
    },
  );
  s.registerTool(
    'smart_insert_tracks',
    {
      title: 'Smart insert tracks',
      description: 'Insert tracks at deterministic distributed positions; dry_run defaults true.',
      inputSchema: {
        ...mutationSchema,
        track_ids: z.array(id).min(1).max(10000),
        min_artist_gap: z.number().int().min(0).max(100).default(1),
        min_album_gap: z.number().int().min(0).max(100).optional(),
        seed: z.number().int().optional(),
      },
    },
    async (a: any) => {
      const x = await playlistState(pid(a)),
        incoming = a.track_ids.map(
          (v: string, i: number) =>
            ({
              uri: tid(v).uri,
              id: tid(v).id,
              position: x.tracks.length + i,
              originalIndex: x.tracks.length + i,
            }) as any,
        );
      const after = [...x.tracks];
      incoming.forEach((t: any, i: number) =>
        after.splice(
          Math.min(after.length, Math.floor(((i + 1) * after.length) / (incoming.length + 1))),
          0,
          t,
        ),
      );
      const plan = operationPlan(pid(a), 'smart_insert', x.tracks, after, [], {
        inserted: incoming.length,
      });
      return a.dry_run
        ? planOutput(plan)
        : text(await executePlan(pid(a), 'smart_insert', x, after, plan));
    },
  );
  s.registerTool(
    'optimize_playlist',
    {
      title: 'Optimize playlist',
      description:
        'Meta-tool composing deterministic playlist primitives; dry_run defaults true and does not snapshot.',
      inputSchema: {
        ...mutationSchema,
        semantic_deduplicate: z.boolean().default(true),
        smart_shuffle: z.boolean().default(true),
        balance_artists: z.boolean().default(false),
        max_artist_share: z.number().min(0).max(1).optional(),
        min_artist_gap: z.number().int().min(0).max(100).default(1),
        min_album_gap: z.number().int().min(0).max(100).optional(),
        seed: z.number().int().optional(),
      },
    },
    async (a: any) => {
      const x = await playlistState(pid(a));
      let after = x.tracks;
      if (a.semantic_deduplicate) {
        const rm = new Set(
          semanticDuplicateGroups(after).flatMap((g) => g.removable.map((t) => t.uri)),
        );
        after = after.filter((t) => !rm.has(t.uri));
      }
      if (a.smart_shuffle || a.balance_artists)
        after = seededShuffle(after, {
          seed: a.seed,
          minArtistGap: a.min_artist_gap,
          minAlbumGap: a.min_album_gap,
        });
      const plan = operationPlan(pid(a), 'optimize', x.tracks, after);
      return a.dry_run
        ? planOutput(plan)
        : text(await executePlan(pid(a), 'optimize', x, after, plan));
    },
  );
  for (const n of ['save_tracks', 'remove_saved_tracks'] as const)
    s.registerTool(
      n,
      {
        title: n,
        description: 'Save or remove tracks using current /me/library endpoint in chunks of 40.',
        inputSchema: { track_ids: z.array(id).min(1).max(10000) },
      },
      async (a: any) => {
        for (const ch of chunks(
          a.track_ids.map((x: string) => tid(x).uri),
          40,
        )) {
          const q = encodeURIComponent(ch.join(','));
          await c.request('/me/library?uris=' + q, {
            method: n === 'save_tracks' ? 'PUT' : 'DELETE',
          });
        }
        return text({
          ok: true,
          requested: a.track_ids.length,
          chunk_count: Math.ceil(a.track_ids.length / 40),
        });
      },
    );
  s.registerTool(
    'check_saved_tracks',
    {
      title: 'Check saved tracks',
      description: 'Return an exact input-to-saved mapping using current /me/library/contains.',
      inputSchema: {
        track_ids: z.array(id).min(1).max(40),
        connection_id: z.string().min(1).optional(),
        provider: z.string().min(1).optional(),
        preferred_connection_id: z.string().min(1).optional(),
        read_fallback: z.boolean().optional(),
      },
    },
    async (a: any) => {
      const inputs = a.track_ids as string[];
      if (reads) {
        const result = await reads.checkSavedTracks(inputs, {
          connection_id: a.connection_id,
          provider: a.provider,
          preferred_connection_id: a.preferred_connection_id,
          read_fallback: a.read_fallback,
        });
        const saved = result.data as boolean[];
        return text(
          inputs.map((input, index) => ({
            input,
            saved: Boolean(saved[index]),
            provider: result.provenance.provider,
            connection_id: result.provenance.connection_id,
            ...(result.provenance.fallback ? { read_fallback: true } : {}),
          })),
        );
      }
      const uris = inputs.map((x) => tid(x).uri),
        r: any = await get('/me/library/contains?uris=' + encodeURIComponent(uris.join(',')));
      return text(
        inputs.map((input, index) => ({ input, uri: uris[index], saved: Boolean(r?.[index]) })),
      );
    },
  );
  const input = z.object({
    title: z.string().min(1).max(200),
    artist: z.string().min(1).max(200),
    album: z.string().max(200).optional(),
    year: z.number().int().min(1900).max(2100).optional(),
  });
  s.registerTool(
    'find_track_exact',
    {
      title: 'Find track exactly',
      description:
        'Resolve a track by deterministic title/artist/album/year scoring; returns matched, ambiguous, or unmatched.',
      inputSchema: input,
    },
    async (a: any) => {
      return text(await resolver.resolve(a));
    },
  );
  s.registerTool(
    'remember_track',
    {
      title: 'Remember track',
      description: 'Verify a known Spotify track ID, URI, or public URL and save its safe alias.',
      inputSchema: {
        track_id: id,
        title: z.string().min(1).max(200),
        artist: z.string().min(1).max(200),
        album: z.string().max(200).optional(),
        provider: z.string().min(1).optional(),
        connection_id: z.string().min(1).optional(),
      },
    },
    async (a: any) => text(await resolver.rememberTrack(a)),
  );
  s.registerTool(
    'find_playlist_by_name',
    {
      title: 'Find playlist by name',
      description: 'Find all current-user playlists matching a normalized name across all pages.',
      inputSchema: { name: z.string().min(1).max(100) },
    },
    async (a: any) => {
      const xs = await allPlaylists();
      return text({
        matches: xs
          .filter((p: any) => normalizeText(p.name) === normalizeText(a.name))
          .map((p: any) => ({ id: p.id, uri: p.uri, name: p.name, public: p.public })),
      });
    },
  );
  const trackInput = z
    .object({
      id: id.optional(),
      uri: id.optional(),
      title: z.string().optional(),
      artist: z.string().optional(),
      album: z.string().optional(),
    })
    .refine((x) => Boolean(x.id || x.uri || (x.title && x.artist)), {
      message: 'Each track needs id/uri or title and artist',
    });
  async function resolve(list: any[]) {
    const searchable = list.filter((x) => !x.id && !x.uri);
    const batch = await resolver.resolveMany(searchable, {
      concurrency: Number(process.env.SPOTIFY_READ_CONCURRENCY) || 12,
    });
    let searchIndex = 0;
    const result: any[] = [];
    for (const x of list) {
      if (x.id || x.uri) {
        try {
          result.push({ status: 'matched', uri: tid(x.id ?? x.uri).uri, source: x });
        } catch {
          result.push({ status: 'unmatched', source: x });
        }
      } else {
        let r: any;
        try {
          r = batch[searchIndex++];
        } catch (error) {
          if (error instanceof SpotifyApiError && error.status === 429)
            r = { status: 'waiting', source: 'spotify_search', errorId: error.apiErrorId };
          else throw error;
        }
        result.push({
          ...r,
          uri: r.status === 'matched' ? (r.uri ?? r.match?.uri) : undefined,
          source: x,
        });
      }
    }
    return result;
  }
  const counts = (report: any[], existing: Set<string>) => ({
    matched: report.filter((x) => x.status === 'matched').length,
    unmatched: report.filter((x) => x.status === 'unmatched').length,
    ambiguous: report.filter((x) => x.status === 'ambiguous').length,
    skipped_existing: report.filter((x) => x.status === 'matched' && existing.has(x.uri)).length,
    waiting: report.filter((x) => x.status === 'waiting').length,
  });
  const waitingJob = (type: string, payload: unknown, items: unknown[], report?: any[]) => {
    if (!isDatabaseInitialized()) return undefined;
    const jobId = createJob(type, payload, items);
    if (report)
      report.forEach((item, index) => {
        if (item.status !== 'waiting')
          updateJobItem(
            getJobItems(jobId)[index].id,
            item.status === 'matched' ? 'completed' : 'failed',
            { ...(items[index] as any), resolution: item },
            undefined,
            item.errorId,
          );
      });
    const state = getRateLimit('spotify', 'search');
    setJobStatus(
      jobId,
      'waiting',
      state?.blockedUntil ?? Date.now() + 60000,
      report?.find((x) => x.errorId)?.errorId,
    );
    return jobId;
  };
  async function addResolved(a: any, list: any[], dry: boolean) {
    const report = await resolve(list);
    const resolverMetrics = resolver.getLastBatchMetrics();
    const bad = report.filter((x) => x.status !== 'matched');
    if (report.some((x) => x.status === 'waiting'))
      return {
        ...counts(report, new Set()),
        resolver: resolverMetrics,
        job_id: waitingJob('add_tracks_by_search', a, list, report),
        job_status: 'waiting',
        added: 0,
        blocked: true,
      };
    let existing = new Set<string>();
    if (a.skip_existing)
      existing = new Set(
        (await allPlaylistItems(pid(a))).map((x: any) => x.item?.uri).filter(Boolean),
      );
    const filtered = report.filter((x) => x.status === 'matched' && !existing.has(x.uri));
    const summary = counts(report, existing);
    if (dry || (a.strict && bad.length))
      return {
        report,
        resolver: resolverMetrics,
        ...summary,
        added: 0,
        dry_run: dry,
        blocked: Boolean(a.strict && bad.length),
      };
    const result = await writeChunks(
      'add_tracks_by_search',
      pid(a),
      filtered.map((x) => x.uri),
      async (part) => c.json('/playlists/' + pid(a) + '/items', { uris: part }),
    );
    return {
      ...result,
      report,
      resolver: resolverMetrics,
      ...summary,
      added: result.successfully_written_count,
    };
  }
  const common = {
    playlist_id: id,
    tracks: z.array(trackInput).min(1).max(10000),
    strict: z.boolean().default(true),
    dry_run: z.boolean().default(false),
    skip_existing: z.boolean().default(false),
  };
  s.registerTool(
    'add_tracks_by_search',
    {
      title: 'Add tracks by search',
      description:
        'Resolve every search entry before writing; strict mode blocks all writes if any is ambiguous or unmatched.',
      inputSchema: common,
    },
    async (a: any) => text(await addResolved(a, a.tracks, a.dry_run)),
  );
  s.registerTool(
    'bulk_add_tracks',
    {
      title: 'Bulk add tracks',
      description:
        'Add mixed ID/URI/search track inputs in ordered chunks; supports strict, dry_run and skip_existing.',
      inputSchema: common,
    },
    async (a: any) => {
      const report = await resolve(a.tracks);
      const resolverMetrics = resolver.getLastBatchMetrics();
      let existing = new Set<string>();
      if (a.skip_existing) {
        const items = await allPlaylistItems(pid(a));
        existing = new Set(items.map((x: any) => x.item?.uri).filter(Boolean));
      }
      const filtered = report.filter((x) => x.status === 'matched' && !existing.has(x.uri));
      const summary = counts(report, existing),
        blocked = a.strict && report.some((x) => x.status !== 'matched');
      if (report.some((x) => x.status === 'waiting'))
        return text({
          ...summary,
          resolver: resolverMetrics,
          job_id: waitingJob('bulk_add_tracks', a, a.tracks, report),
          job_status: 'waiting',
          added: 0,
          blocked: true,
        });
      if (blocked || a.dry_run)
        return text({
          report,
          resolver: resolverMetrics,
          ...summary,
          added: 0,
          dry_run: a.dry_run,
          blocked,
        });
      const result = await writeChunks(
        'bulk_add_tracks',
        pid(a),
        filtered.map((x) => x.uri),
        async (part) => c.json('/playlists/' + pid(a) + '/items', { uris: part }),
      );
      return text({
        ...result,
        report,
        resolver: resolverMetrics,
        ...summary,
        added: result.successfully_written_count,
      });
    },
  );
  s.registerTool(
    'get_playlist_stats',
    {
      title: 'Get playlist stats',
      description: 'Fetches all playlist items and computes local aggregates.',
      inputSchema: { playlist_id: id },
    },
    async (a: any) => {
      const p: any = await get('/playlists/' + pid(a));
      const all = await allPlaylistItems(pid(a));
      const tracks = all.map((x) => x.item).filter((x) => x?.type === 'track'),
        counts = new Map<string, number>(),
        artists = new Map<string, { id: string; name: string; occurrence_count: number }>();
      for (const x of tracks) {
        counts.set(x.uri, (counts.get(x.uri) ?? 0) + 1);
        for (const ar of x.artists ?? [])
          if (ar.id)
            artists.set(ar.id, {
              id: ar.id,
              name: ar.name,
              occurrence_count: (artists.get(ar.id)?.occurrence_count ?? 0) + 1,
            });
      }
      const ms = tracks.reduce((n, x) => n + (x.duration_ms ?? 0), 0);
      return text({
        playlist_id: pid(a),
        name: p?.name,
        total_items: all.length,
        track_count: tracks.length,
        episode_count: all.filter((x) => x.item?.type === 'episode').length,
        local_item_count: all.filter((x) => x.item?.is_local).length,
        unique_track_count: counts.size,
        duplicate_count: [...counts.values()].filter((n) => n > 1).reduce((n, v) => n + v - 1, 0),
        total_duration_ms: ms,
        total_duration_human: Math.floor(ms / 60000) + 'm ' + (Math.floor(ms / 1000) % 60) + 's',
        explicit_track_count: tracks.filter((x) => x.explicit).length,
        unique_artist_count: artists.size,
        top_artists: [...artists.values()].sort((a, b) => b.occurrence_count - a.occurrence_count),
        duplicate_tracks: [...counts]
          .filter(([, n]) => n > 1)
          .map(([uri, count]) => ({ uri, count })),
        snapshot_id: p?.snapshot_id,
      });
    },
  );
  s.registerTool(
    'deduplicate_playlist',
    {
      title: 'Deduplicate playlist',
      description:
        'Fetches all items, preserves first occurrence and order, and refuses lossless reconstruction when unsupported items exist.',
      inputSchema: { playlist_id: id, dry_run: z.boolean().default(false) },
    },
    async (a: any) => {
      const idValue = pid(a),
        items = await allPlaylistItems(idValue);
      const unsafe = items.filter((x: any) => !x.item?.uri || x.item?.is_local);
      if (unsafe.length)
        return text({
          ok: false,
          error: {
            type: 'unsafe_destructive_operation',
            message:
              'Playlist contains null, unsupported, or local items that cannot be losslessly reconstructed.',
            unsafe_count: unsafe.length,
          },
          dry_run: a.dry_run,
        });
      const seen = new Set<string>(),
        keep: any[] = [],
        duplicates: any[] = [];
      for (const x of items) {
        const uri = x.item.uri;
        if (seen.has(uri)) duplicates.push(uri);
        else {
          seen.add(uri);
          keep.push(uri);
        }
      }
      if (!a.dry_run && duplicates.length) {
        const result = await writeChunks(
          'deduplicate_playlist',
          idValue,
          keep,
          async (part, index) =>
            c.json(
              '/playlists/' + idValue + '/items',
              { uris: part },
              index === 0 ? 'PUT' : 'POST',
            ),
          { rollback: () => restoreSnapshot(idValue, items) },
        );
        return text({
          original_count: items.length,
          resulting_count: keep.length,
          duplicate_count: duplicates.length,
          duplicate_entries: duplicates,
          changes: 'replace with first-occurrence ordered sequence',
          ...result,
          dry_run: a.dry_run,
        });
      }
      return text({
        original_count: items.length,
        resulting_count: keep.length,
        duplicate_count: duplicates.length,
        duplicate_entries: duplicates,
        changes: duplicates.length > 0 ? 'replace with first-occurrence ordered sequence' : 'none',
        dry_run: a.dry_run,
      });
    },
  );
  s.registerTool(
    'create_playlist_from_tracks',
    {
      title: 'Create playlist from tracks',
      description:
        'Resolves all tracks before creation in strict mode, then creates and inserts sequential chunks.',
      inputSchema: {
        name: z.string().min(1).max(100),
        description: z.string().max(300).optional(),
        public: z.boolean().default(false),
        tracks: z.array(trackInput).min(1).max(10000),
        strict: z.boolean().default(true),
        skip_duplicates: z.boolean().default(true),
        connection_id: z.string().min(1).optional(),
        provider: z.string().min(1).optional(),
        preferred_connection_id: z.string().min(1).optional(),
      },
    },
    async (a: any) => {
      const report = await resolve(a.tracks);
      if (report.some((x) => x.status === 'waiting'))
        return text({
          created: false,
          job_id: waitingJob('create_playlist_from_tracks', a, a.tracks, report),
          job_status: 'waiting',
          report,
          reason: 'rate_limited',
        });
      if (a.strict && report.some((x) => x.status !== 'matched'))
        return text({ created: false, report, reason: 'resolution_failed' });
      const us = report.filter((x) => x.status === 'matched').map((x) => x.uri);
      const ordered = a.skip_duplicates ? [...new Set(us)] : us;
      if (!playlists) throw new Error('Playlist gateway is required for playlist writes');
      const p: any = await playlists.create(
        {
          name: a.name,
          description: a.description ?? '',
          public: a.public,
        },
        {
          connection_id: a.connection_id,
          provider: a.provider,
          preferred_connection_id: a.preferred_connection_id,
        },
      );
      const result: any = await playlists.add(p.id, ordered, {
        connection_id: a.connection_id,
        provider: a.provider,
        preferred_connection_id: a.preferred_connection_id,
      });
      return text({
        created: true,
        playlist: p,
        report,
        added: result.successfully_written_count ?? result.added,
        ...result,
      });
    },
  );
  if (includeStateTools)
    s.registerTool(
      'create_bulk_job',
      {
        title: 'Create bulk job',
        description: 'Persist a bulk track operation for later processing.',
        inputSchema: {
          type: z.string().min(1).max(100),
          payload: z.record(z.string(), z.unknown()).default({}),
          items: z.array(z.record(z.string(), z.unknown())).min(1).max(10000),
          max_attempts: z.number().int().min(1).max(20).default(5),
        },
      },
      async (a: any) =>
        text({
          job_id: createJob(a.type, a.payload, a.items, a.max_attempts),
          job_status: 'pending',
        }),
    );
  if (includeStateTools)
    s.registerTool(
      'get_job_status',
      {
        title: 'Get job status',
        description: 'Inspect a durable bulk job with bounded item pagination.',
        inputSchema: {
          job_id: z.number().int().positive(),
          offset: z.number().int().min(0).default(0),
          limit: z.number().int().min(1).max(100).default(25),
        },
      },
      async (a: any) => text(getJob(a.job_id, a.offset, a.limit) ?? { error: 'job_not_found' }),
    );
  if (includeStateTools)
    s.registerTool(
      'list_jobs',
      {
        title: 'List jobs',
        description: 'List bounded durable job summaries.',
        inputSchema: {
          offset: z.number().int().min(0).default(0),
          limit: z.number().int().min(1).max(100).default(25),
        },
      },
      async (a: any) =>
        text({ jobs: listJobs(a.offset, a.limit), offset: a.offset, limit: a.limit }),
    );
  if (includeStateTools)
    s.registerTool(
      'resume_job',
      {
        title: 'Resume job',
        description: 'Make a durable job eligible for processing.',
        inputSchema: { job_id: z.number().int().positive() },
      },
      async (a: any) => {
        const job = getJob(a.job_id, 0, 1);
        if (!job) return text({ error: 'job_not_found' });
        if (job.status === 'cancelled' || job.status === 'completed')
          return text({ error: 'invalid_resume_state', job_status: job.status });
        const state = getRateLimit('spotify', 'search');
        if (state) {
          setJobStatus(a.job_id, 'waiting', state.blockedUntil ?? Date.now() + 60000);
          return text({ job_id: a.job_id, job_status: 'waiting', run_after: state.blockedUntil });
        }
        setJobStatus(a.job_id, 'pending', Date.now());
        return text({
          job_id: a.job_id,
          job_status: 'pending',
          progress: getJob(a.job_id, 0, 1)?.counts,
        });
      },
    );
  if (includeStateTools)
    s.registerTool(
      'commit_job',
      {
        title: 'Commit job',
        description: 'Commit a ready durable job with ordered, chunked Spotify writes.',
        inputSchema: { job_id: z.number().int().positive() },
      },
      async (a: any) => {
        const job = getJob(a.job_id, 0, 1);
        if (!job) return text({ error: 'job_not_found' });
        const payload = job.payload as any;
        if (
          payload.phase !== 'ready_to_commit' ||
          ['cancelled', 'completed'].includes(String(job.status))
        )
          return text({ job_id: a.job_id, job_status: job.status, error: 'invalid_commit_state' });
        const rows = getJobItems(a.job_id);
        const unresolved = rows.filter((x) => x.status !== 'completed');
        if (payload.strict !== false && unresolved.length)
          return text({
            job_id: a.job_id,
            error: 'unresolved_items',
            unresolved_count: unresolved.length,
          });
        let uris = rows
          .filter((x) => x.status === 'completed')
          .sort((x, y) => x.position - y.position)
          .map((x) => {
            const item: any = x.payload ? JSON.parse(x.payload) : {};
            return item.resolution?.uri;
          })
          .filter(Boolean);
        if (payload.skip_duplicates) uris = [...new Set(uris)];
        if (payload.skip_existing && payload.playlist_id) {
          const existing = new Set(
            (await allPlaylistItems(pid({ playlist_id: payload.playlist_id })))
              .map((x: any) => x.item?.uri)
              .filter(Boolean),
          );
          uris = uris.filter((uri) => !existing.has(uri));
        }
        if (payload.dry_run) {
          const dryRunResult = { dry_run: true, requested_count: uris.length, uris };
          updateJobPayload(a.job_id, {
            ...payload,
            phase: 'completed',
            dry_run: true,
            commit_result: dryRunResult,
          });
          setJobStatus(a.job_id, 'completed');
          return text({
            job_id: a.job_id,
            job_status: 'completed',
            phase: 'completed',
            ...dryRunResult,
          });
        }
        try {
          updateJobPayload(a.job_id, {
            ...payload,
            phase: 'committing',
            commit_started_at: Date.now(),
            commit_operation: job.type,
          });
          setJobStatus(a.job_id, 'running');
          let playlistId = payload.playlist_id as string | undefined;
          let playlist: any;
          if (job.type === 'create_playlist_from_tracks') {
            playlist = playlists
              ? await playlists.create(
                  {
                    name: payload.name,
                    description: payload.description ?? '',
                    public: payload.public ?? false,
                  },
                  {
                    connection_id: payload.connection_id as string | undefined,
                    provider: payload.provider as string | undefined,
                    preferred_connection_id: payload.preferred_connection_id as string | undefined,
                  },
                )
              : await c.json('/me/playlists', {
                  name: payload.name,
                  description: payload.description ?? '',
                  public: payload.public ?? false,
                });
            playlistId = playlist.id;
          }
          if (!playlistId) return text({ job_id: a.job_id, error: 'playlist_id_required' });
          const result: any = playlists
            ? await playlists.add(playlistId, uris, {
                connection_id: payload.connection_id as string | undefined,
                provider: payload.provider as string | undefined,
                preferred_connection_id: payload.preferred_connection_id as string | undefined,
              })
            : await writeChunks(`job:${job.type}`, playlistId, uris, async (part) =>
                c.json('/playlists/' + playlistId + '/items', { uris: part }),
              );
          if (!result.ok) {
            updateJobPayload(a.job_id, {
              ...payload,
              phase: 'failed',
              commit_result: result,
              manual_review: Boolean(result.partial),
            });
            setJobStatus(a.job_id, 'failed');
            return text({ job_id: a.job_id, job_status: 'failed', result });
          }
          updateJobPayload(a.job_id, {
            ...payload,
            phase: 'completed',
            playlist_id: playlistId,
            playlist,
            commit_result: result,
          });
          setJobStatus(a.job_id, 'completed');
          return text({ job_id: a.job_id, job_status: 'completed', playlist, result });
        } catch {
          updateJobPayload(a.job_id, {
            ...payload,
            phase: 'failed',
            manual_review: true,
            commit_error: 'transport_uncertain',
          });
          setJobStatus(a.job_id, 'failed');
          return text({
            job_id: a.job_id,
            job_status: 'failed',
            manual_review: true,
            error: 'transport_uncertain',
          });
        }
      },
    );
  if (includeStateTools)
    s.registerTool(
      'cancel_job',
      {
        title: 'Cancel job',
        description: 'Cancel a durable job without deleting its history.',
        inputSchema: { job_id: z.number().int().positive() },
      },
      async (a: any) => {
        cancelJob(a.job_id);
        return text({ job_id: a.job_id, job_status: 'cancelled' });
      },
    );
  if (includeStateTools)
    s.registerTool(
      'get_state_diagnostics',
      {
        title: 'Get State DB diagnostics',
        description: 'Return authenticated, bounded State DB health counters.',
        inputSchema: { provider: z.string().optional(), connection_id: z.string().optional() },
      },
      async (a: any) => text(listStateDiagnostics(a.provider, a.connection_id)),
    );
  if (includeStateTools)
    s.registerTool(
      'get_rate_limit_status',
      {
        title: 'Get rate limit status',
        description: 'Inspect persisted provider rate-limit scopes.',
        inputSchema: {
          provider: z.string().default('spotify'),
          scope: z.string().optional(),
          connection_id: z.string().optional(),
        },
      },
      async (a: any) => text(getRateLimitStatus(a.provider, a.scope, a.connection_id ?? 'default')),
    );
  if (includeStateTools)
    s.registerTool(
      'get_recent_api_errors',
      {
        title: 'Get recent API errors',
        description: 'Inspect bounded, normalized API error history.',
        inputSchema: {
          limit: z.number().int().min(1).max(100).default(25),
          provider: z.string().optional(),
          status_code: z.number().int().optional(),
          unresolved_only: z.boolean().default(false),
          connection_id: z.string().optional(),
        },
      },
      async (a: any) =>
        text(
          getRecentApiErrors(
            a.limit,
            a.provider,
            a.status_code,
            a.unresolved_only,
            a.connection_id,
          ),
        ),
    );
  s.registerTool(
    'chapterize_playlist',
    {
      title: 'Chapterize playlist',
      description:
        'Analyze the existing playlist order into deterministic narrative chapters. Read-only for Spotify.',
      inputSchema: {
        playlist_id: id,
        style: z.enum(['narrative', 'balanced', 'energy', 'album_like']).default('narrative'),
        target_chapter_minutes: z.number().int().min(10).max(240).optional(),
        min_chapter_minutes: z.number().int().min(1).max(240).optional(),
        max_chapter_minutes: z.number().int().min(1).max(360).optional(),
        chapter_count: z.number().int().min(1).max(50).optional(),
        regenerate_titles: z.boolean().default(false),
        save: z.boolean().default(true),
      },
    },
    async (a: any) =>
      text(
        await chapterEngine.chapterize(
          pid(a),
          {
            targetChapterMinutes: a.target_chapter_minutes,
            minChapterMinutes: a.min_chapter_minutes,
            maxChapterMinutes: a.max_chapter_minutes,
            chapterCount: a.chapter_count,
            regenerateTitles: a.regenerate_titles,
            style: a.style,
          },
          a.save,
        ),
      ),
  );
  s.registerTool(
    'get_playlist_chapters',
    {
      title: 'Get playlist chapters',
      description:
        'Read the latest saved chapter set and report whether the playlist order has changed.',
      inputSchema: { playlist_id: id.optional(), chapter_set_id: id.optional() },
    },
    async (a: any) => text(await chapterEngine.get(a.playlist_id, a.chapter_set_id)),
  );
  s.registerTool(
    'play_playlist_chapter',
    {
      title: 'Play playlist chapter',
      description:
        'Start Spotify playback at a chapter offset; playback may continue after the chapter ends.',
      inputSchema: {
        playlist_id: id,
        chapter_set_id: id,
        chapter_number: z.number().int().positive(),
        device_id: id.optional(),
      },
    },
    async (a: any) =>
      text(await chapterEngine.play(pid(a), a.chapter_set_id, a.chapter_number, a.device_id)),
  );
  s.registerTool(
    'resume_playlist_chapter',
    {
      title: 'Resume playlist chapter',
      description: 'Resume a previously started chapter from its first saved position.',
      inputSchema: {
        playlist_id: id,
        chapter_set_id: id,
        chapter_number: z.number().int().positive(),
        device_id: id.optional(),
      },
    },
    async (a: any) =>
      text(await chapterEngine.play(pid(a), a.chapter_set_id, a.chapter_number, a.device_id)),
  );
  registerPlaylistAutomationTools(s, c);
  const personalizationGateway =
    playlists ??
    (() => {
      const registry = new ProviderRegistry();
      registry.register(new SpotifyProviderAdapter(undefined as any, c));
      return new PlaylistGatewayImpl(registry);
    })();
  registerPlaylistPersonalizationTools(s, personalizationGateway);
}
