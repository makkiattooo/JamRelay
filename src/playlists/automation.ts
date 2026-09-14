import * as z from 'zod/v4';
import { randomUUID } from 'node:crypto';
import { SpotifyClient } from '../spotify/client.js';
import { parseSpotifyIdentifier } from '../spotify/identifiers.js';
import { chunks } from '../utils/chunks.js';
import { normalizePlaylistItems } from './normalize.js';
import { durationMs, trimTracks } from './duration.js';
import { evaluateRules, type PlaylistRule } from './rules.js';
import { filterTracks } from './filters.js';
import { seededShuffle } from './shuffle.js';
import { makePlan } from './planner.js';
import { composePlans } from './composition.js';
import { saveSnapshot } from './snapshots.js';
import { createRecipe, deleteRecipe, getRecipe, listRecipes, updateRecipe } from './recipes.js';
import type { NormalizedPlaylistTrack } from './types.js';
const id = z.string().min(1),
  text = (x: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(x) }],
    structuredContent: x,
  });
export const PLAYLIST_AUTOMATION_TOOL_NAMES = [
  'playlist_rules_engine',
  'playlist_recipe',
  'apply_playlist_recipe',
  'merge_playlists_smart',
  'split_playlist_balanced',
  'playlist_trim_to_duration',
  'extend_playlist_to_duration',
  'replace_percentage',
  'freshen_playlist',
  'filter_playlist',
  'move_artist_tracks',
  'extract_artist_tracks',
  'remove_artist_from_playlist',
  'replace_artist_tracks',
  'clone_playlist',
  'sync_playlists',
  'bulk_edit_playlists',
  'batch_playlist_jobs',
  'estimate_operation_cost',
] as const;
export function registerPlaylistAutomationTools(s: any, c: SpotifyClient) {
  const get = (p: string) => c.request<any>(p),
    pid = (x: string) => parseSpotifyIdentifier(x, 'playlist').id;
  const state = async (playlistId: string) => {
    const meta: any = await get('/playlists/' + playlistId),
      all: any[] = [];
    for (let o = 0; o < 10000;) {
      const p: any = await get(`/playlists/${playlistId}/items?limit=50&offset=${o}`),
        page = p?.items ?? [];
      if (!page.length) break;
      all.push(...page);
      o += page.length;
      if (!p.next) break;
    }
    return { meta, raw: all, ...normalizePlaylistItems(all) };
  };
  const plan = (
    playlistId: string,
    op: string,
    before: NormalizedPlaylistTrack[],
    after: NormalizedPlaylistTrack[],
    warnings: string[] = [],
  ) =>
    makePlan({
      playlistId,
      operation: op,
      before,
      after,
      warnings,
      removals: before
        .filter((x) => !after.some((y) => y.uri === x.uri))
        .flatMap((x) => (x.uri ? [{ uri: x.uri, position: x.position }] : [])),
    });
  const execute = async (playlistId: string, x: any, after: NormalizedPlaylistTrack[], p: any) => {
    const snap = saveSnapshot({
      playlistId,
      spotifySnapshotId: x.meta?.snapshot_id,
      metadata: x.meta,
      uris: x.tracks.flatMap((t: NormalizedPlaylistTrack) => (t.uri ? [t.uri] : [])),
      reason: p.operation,
    });
    try {
      const uris = after.flatMap((t) => (t.uri ? [t.uri] : []));
      await c.json(`/playlists/${playlistId}/items`, { uris: uris.slice(0, 100) }, 'PUT');
      for (const part of chunks(uris.slice(100)))
        await c.json(`/playlists/${playlistId}/items`, { uris: part });
      const verified = await state(playlistId);
      const verifiedUris = verified.tracks.flatMap((track) => (track.uri ? [track.uri] : []));
      if (
        verifiedUris.length !== uris.length ||
        verifiedUris.some((uri, index) => uri !== uris[index])
      )
        throw new Error('playlist_integrity_mismatch');
      return {
        plan: p,
        safety_snapshot_id: snap.id,
        verification: { ok: true, expected_count: uris.length, actual_count: verifiedUris.length },
      };
    } catch (error) {
      let rollbackSucceeded = false;
      try {
        const originalUris = x.tracks.flatMap((track: NormalizedPlaylistTrack) =>
          track.uri ? [track.uri] : [],
        );
        await c.json(`/playlists/${playlistId}/items`, { uris: originalUris.slice(0, 100) }, 'PUT');
        for (const part of chunks(originalUris.slice(100)))
          await c.json(`/playlists/${playlistId}/items`, { uris: part });
        rollbackSucceeded = true;
      } catch {
        rollbackSucceeded = false;
      }
      return {
        plan: p,
        safety_snapshot_id: snap.id,
        partial_failure: {
          error: String(error),
          rollback_attempted: true,
          rollback_succeeded: rollbackSucceeded,
        },
      };
    }
  };
  s.registerTool(
    'playlist_rules_engine',
    {
      title: 'Playlist rules engine',
      description: 'Read-only deterministic rule evaluation; never mutates Spotify.',
      inputSchema: {
        playlist_id: id,
        rules: z.array(z.record(z.string(), z.unknown())).max(50),
        dry_run: z.boolean().default(true),
      },
    },
    async (a: any) => {
      const x = await state(pid(a)),
        results = evaluateRules(x.tracks, a.rules as PlaylistRule[]);
      return text({
        rules_evaluated: results,
        passed_rules: results.filter((r) => r.passed),
        failed_rules: results.filter((r) => !r.passed),
        violation_count: results.reduce((n, r) => n + r.violations, 0),
        automatic_correction_possible: results.some((r) => !r.passed),
        suggested_corrections: results.filter((r) => !r.passed).map((r) => r.reason),
      });
    },
  );
  s.registerTool(
    'playlist_recipe',
    {
      title: 'Playlist recipe',
      description: 'Create, read, list, update or delete a persistent versioned playlist recipe.',
      inputSchema: {
        action: z.enum(['create', 'get', 'list', 'update', 'delete']),
        recipe_id: id.optional(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        rules: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
        operations: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (a: any) => {
      if (a.action === 'list') return text(listRecipes());
      if (a.action === 'create')
        return text(
          createRecipe({
            name: a.name,
            description: a.description,
            rules: a.rules ?? [],
            operations: a.operations,
          }),
        );
      if (a.action === 'get') return text(getRecipe(a.recipe_id));
      if (a.action === 'delete') return text(deleteRecipe(a.recipe_id));
      return text(
        updateRecipe(a.recipe_id, {
          name: a.name,
          description: a.description,
          rules: a.rules,
          operations: a.operations,
        }),
      );
    },
  );
  s.registerTool(
    'apply_playlist_recipe',
    {
      title: 'Apply playlist recipe',
      description:
        'Apply a persistent recipe; dry_run defaults true, execution creates one safety snapshot.',
      inputSchema: {
        playlist_id: id,
        recipe_id: id,
        dry_run: z.boolean().default(true),
        seed: z.number().int().optional(),
      },
    },
    async (a: any) => {
      const r = getRecipe(a.recipe_id);
      if (!r) throw new Error('recipe_not_found');
      const x = await state(pid(a)),
        results = evaluateRules(x.tracks, r.rules),
        after = r.operations.smart_shuffle
          ? seededShuffle(x.tracks, { seed: a.seed, minArtistGap: 1 })
          : x.tracks,
        p = plan(
          pid(a),
          'apply_recipe',
          x.tracks,
          after,
          results.filter((v) => !v.passed).map((v) => v.reason),
        );
      return text(
        a.dry_run
          ? { ...p, recipe_id: r.recipeId, recipe_version: r.version, rule_results: results }
          : await execute(pid(a), x, after, p),
      );
    },
  );
  s.registerTool(
    'playlist_trim_to_duration',
    {
      title: 'Trim playlist to duration',
      description: 'Plan or trim a playlist without exceeding the target; dry_run defaults true.',
      inputSchema: {
        playlist_id: id,
        target_duration_ms: z.number().int().positive().optional(),
        target_minutes: z.number().positive().optional(),
        strategy: z
          .enum([
            'from_end',
            'preserve_artist_balance',
            'preserve_unique_artists',
            'deterministic_random',
          ])
          .default('from_end'),
        seed: z.number().int().optional(),
        dry_run: z.boolean().default(true),
      },
    },
    async (a: any) => {
      const x = await state(pid(a)),
        target = a.target_duration_ms ?? a.target_minutes * 60000,
        after = trimTracks(x.tracks, target, a.strategy, a.seed),
        p = plan(pid(a), 'trim_to_duration', x.tracks, after);
      return text(
        a.dry_run
          ? {
              ...p,
              original_duration_ms: durationMs(x.tracks),
              resulting_duration_ms: durationMs(after),
              removed_tracks: p.removals,
            }
          : await execute(pid(a), x, after, p),
      );
    },
  );
  s.registerTool(
    'filter_playlist',
    {
      title: 'Filter playlist',
      description: 'Filter by typed deterministic predicates; dry_run defaults true.',
      inputSchema: {
        playlist_id: id,
        filters: z.array(z.record(z.string(), z.unknown())).max(20),
        mode: z.enum(['keep_matching', 'remove_matching']),
        dry_run: z.boolean().default(true),
      },
    },
    async (a: any) => {
      const x = await state(pid(a)),
        f = filterTracks(x.tracks, a.filters as any, a.mode),
        p = plan(pid(a), 'filter', x.tracks, f.result);
      return text(
        a.dry_run
          ? {
              ...p,
              matching_tracks: f.matching.map((t) => t.uri),
              affected_count: x.tracks.length - f.result.length,
            }
          : await execute(pid(a), x, f.result, p),
      );
    },
  );
  s.registerTool(
    'clone_playlist',
    {
      title: 'Clone playlist',
      description:
        'Clone ordered playlist content; dry_run defaults true and never creates a playlist.',
      inputSchema: {
        playlist_id: id,
        new_name: z.string().max(100).optional(),
        include_description: z.boolean().default(true),
        dry_run: z.boolean().default(true),
      },
    },
    async (a: any) => {
      const x = await state(pid(a)),
        uris = x.tracks.flatMap((t) => (t.uri ? [t.uri] : []));
      if (a.dry_run)
        return text({
          source_playlist_id: pid(a),
          track_count: uris.length,
          proposed_name: a.new_name ?? `${x.meta.name} (copy)`,
          estimated_api_calls: 1 + Math.ceil(uris.length / 100),
        });
      const created: any = await c.json('/me/playlists', {
        name: a.new_name ?? `${x.meta.name} (copy)`,
        description: a.include_description ? (x.meta.description ?? '') : '',
        public: false,
      });
      await c.json(`/playlists/${created.id}/items`, { uris: uris.slice(0, 100) }, 'PUT');
      for (const part of chunks(uris.slice(100)))
        await c.json(`/playlists/${created.id}/items`, { uris: part });
      return text({ created_playlist_id: created.id, track_count: uris.length });
    },
  );
  s.registerTool(
    'estimate_operation_cost',
    {
      title: 'Estimate operation cost',
      description: 'Read-only conservative Spotify API request estimate; no financial pricing.',
      inputSchema: {
        playlist_id: id.optional(),
        operation: z.string().min(1),
        track_count: z.number().int().min(0).optional(),
      },
    },
    async (a: any) => {
      const n = a.track_count ?? 0,
        reads = a.playlist_id ? Math.max(1, Math.ceil(n / 50)) : 0,
        writes = Math.max(0, Math.ceil(n / 100));
      return text({
        spotify_read_requests: reads,
        spotify_write_requests: writes,
        pagination_requests: reads,
        recommended_job: n > 1000,
        operation_class: n > 1000 ? 'heavy' : n > 200 ? 'medium' : 'light',
      });
    },
  );
  s.registerTool(
    'merge_playlists_smart',
    {
      title: 'Smart merge playlists',
      description: 'Merge source playlists without mutating them; dry_run defaults true.',
      inputSchema: {
        playlist_ids: z.array(id).min(2).max(50),
        target_playlist_id: id.optional(),
        new_playlist_name: z.string().max(100).optional(),
        dry_run: z.boolean().default(true),
        deduplicate: z.enum(['none', 'exact', 'semantic']).default('exact'),
        balance_artists: z.boolean().default(false),
        seed: z.number().int().optional(),
      },
    },
    async (a: any) => {
      const states = await Promise.all(a.playlist_ids.map((v: string) => state(pid(v)))),
        all = states.flatMap((x: any) => x.tracks),
        seen = new Set<string>(),
        unique =
          a.deduplicate === 'none'
            ? all
            : all.filter((t: NormalizedPlaylistTrack) => {
                if (!t.uri || seen.has(t.uri)) return false;
                seen.add(t.uri);
                return true;
              }),
        ordered = a.balance_artists
          ? seededShuffle(unique, { seed: a.seed, minArtistGap: 1 })
          : unique;
      const result = {
        source_playlists: a.playlist_ids,
        source_track_counts: states.map((x: any) => x.tracks.length),
        duplicates_detected: all.length - unique.length,
        resulting_track_count: ordered.length,
        resulting_duration_ms: durationMs(ordered),
        proposed_ordering: ordered.map((t) => t.uri),
        estimated_api_calls: 1 + Math.ceil(ordered.length / 100),
      };
      if (a.dry_run || !a.target_playlist_id) return text(result);
      const x = await state(pid(a.target_playlist_id)),
        p = plan(pid(a.target_playlist_id), 'merge', x.tracks, ordered);
      return text({ ...result, ...(await execute(pid(a.target_playlist_id), x, ordered, p)) });
    },
  );
  s.registerTool(
    'split_playlist_balanced',
    {
      title: 'Split playlist',
      description: 'Split a playlist into deterministic groups; dry_run defaults true.',
      inputSchema: {
        playlist_id: id,
        parts: z.number().int().min(1).max(100).optional(),
        max_tracks_per_playlist: z.number().int().min(1).optional(),
        strategy: z
          .enum(['balanced_artists', 'sequential', 'round_robin'])
          .default('balanced_artists'),
        dry_run: z.boolean().default(true),
        output_name_template: z.string().max(100).optional(),
      },
    },
    async (a: any) => {
      const x = await state(pid(a)),
        parts = a.parts ?? Math.ceil(x.tracks.length / a.max_tracks_per_playlist),
        groups: NormalizedPlaylistTrack[][] = Array.from({ length: Math.max(1, parts) }, () => []);
      x.tracks.forEach((t: NormalizedPlaylistTrack, i: number) =>
        groups[
          a.strategy === 'sequential'
            ? Math.min(groups.length - 1, Math.floor((i * groups.length) / x.tracks.length))
            : i % groups.length
        ].push(t),
      );
      return text({
        output_count: groups.length,
        tracks_per_output: groups.map((g) => g.length),
        duration_per_output_ms: groups.map(durationMs),
        proposed_names: groups.map((_, i) =>
          (a.output_name_template ?? `${x.meta.name} %s`).replace('%s', String(i + 1)),
        ),
        dry_run: a.dry_run,
      });
    },
  );
  const artistAction = (name: string, remove: boolean) =>
    s.registerTool(
      name,
      {
        title: name,
        description: `${name} using playlist metadata; dry_run defaults true.`,
        inputSchema: {
          playlist_id: id,
          artist_id: id.optional(),
          artist_name: z.string().max(200).optional(),
          dry_run: z.boolean().default(true),
        },
      },
      async (a: any) => {
        const x = await state(pid(a)),
          wanted = (a.artist_id ?? a.artist_name ?? '').toLocaleLowerCase(),
          affected = x.tracks.filter(
            (t) =>
              t.artistIds.includes(a.artist_id) ||
              t.artistNames.some((n) => n.toLocaleLowerCase() === wanted),
          ),
          after = remove
            ? x.tracks.filter((t) => !affected.includes(t))
            : [...affected, ...x.tracks.filter((t) => !affected.includes(t))],
          p = plan(pid(a), name, x.tracks, after);
        return text(
          a.dry_run
            ? { ...p, affected_tracks: affected.map((t) => t.uri) }
            : await execute(pid(a), x, after, p),
        );
      },
    );
  artistAction('remove_artist_from_playlist', true);
  artistAction('move_artist_tracks', false);
  artistAction('extract_artist_tracks', false);
  artistAction('replace_artist_tracks', true);
  s.registerTool(
    'sync_playlists',
    {
      title: 'Sync playlists',
      description: 'Plan or apply deterministic playlist synchronization; dry_run defaults true.',
      inputSchema: {
        source_playlist_id: id,
        target_playlist_id: id,
        mode: z.enum(['mirror', 'append_missing', 'remove_extra', 'two_way_union']),
        dry_run: z.boolean().default(true),
      },
    },
    async (a: any) => {
      const source = await state(pid(a)),
        target = await state(pid(a)),
        sUris = source.tracks.map((t) => t.uri!),
        tUris = target.tracks.map((t) => t.uri!),
        out =
          a.mode === 'mirror'
            ? sUris
            : a.mode === 'append_missing'
              ? [...tUris, ...sUris.filter((u) => !tUris.includes(u))]
              : a.mode === 'remove_extra'
                ? tUris.filter((u) => sUris.includes(u))
                : [...tUris, ...sUris.filter((u) => !tUris.includes(u))];
      const after = out.map(
        (uri, position) => ({ uri, position, id: uri.split(':').pop() }) as any,
      );
      const p = plan(pid(a.target_playlist_id), 'sync', target.tracks, after);
      return text(
        a.dry_run
          ? { ...p, affected_playlists: [a.target_playlist_id] }
          : await execute(pid(a.target_playlist_id), target, after, p),
      );
    },
  );
  s.registerTool(
    'extend_playlist_to_duration',
    {
      title: 'Extend playlist to duration',
      description:
        'Resolve a local candidate pool, append only needed tracks, snapshot and verify.',
      inputSchema: {
        playlist_id: id,
        target_duration_ms: z.number().int().positive(),
        dry_run: z.boolean().default(true),
        candidate_limit: z.number().int().min(1).max(200).default(50),
        min_artist_gap: z.number().int().min(0).max(100).default(1),
        seed: z.number().int().optional(),
      },
    },
    async (a: any) => {
      const playlistId = pid(a),
        current = await state(playlistId),
        currentDuration = durationMs(current.tracks);
      if (currentDuration >= a.target_duration_ms)
        return text({
          operation: 'extend_playlist_to_duration',
          status: 'noop',
          current_duration_ms: currentDuration,
          target_duration_ms: a.target_duration_ms,
          spotify_api_calls: 2,
        });
      const existing = new Set(current.tracks.map((track) => track.uri));
      const artistNames = [
        ...new Set(current.tracks.map((track) => track.primaryArtist).filter(Boolean)),
      ].slice(0, 4);
      const candidatePages = await Promise.all(
        artistNames.map((artist) =>
          get(
            '/search?' +
              new URLSearchParams({
                q: `artist:${artist}`,
                type: 'track',
                limit: String(Math.min(50, a.candidate_limit)),
              }),
          ),
        ),
      );
      const candidates = candidatePages
        .flatMap((response: any) => response?.tracks?.items ?? [])
        .map((track: any, position: number) =>
          normalizePlaylistItems([track]).tracks[0]
            ? { ...normalizePlaylistItems([track]).tracks[0], position }
            : null,
        )
        .filter((track: any): track is NormalizedPlaylistTrack =>
          Boolean(track?.uri && !existing.has(track.uri)),
        )
        .filter(
          (track: NormalizedPlaylistTrack, index: number, all: NormalizedPlaylistTrack[]) =>
            all.findIndex((item) => item.uri === track.uri) === index,
        )
        .slice(0, a.candidate_limit);
      const selected: NormalizedPlaylistTrack[] = [];
      let addedDuration = 0;
      for (const candidate of seededShuffle(candidates, {
        seed: a.seed,
        minArtistGap: a.min_artist_gap,
      })) {
        if (addedDuration >= a.target_duration_ms - currentDuration) break;
        selected.push({ ...candidate, position: current.tracks.length + selected.length });
        addedDuration += candidate.durationMs ?? 0;
      }
      const after = [...current.tracks, ...selected];
      const p = plan(
        playlistId,
        'extend_playlist_to_duration',
        current.tracks,
        after,
        candidates.length ? [] : ['No candidate tracks were found from current playlist artists.'],
      );
      const result = a.dry_run
        ? {
            ...p,
            current_duration_ms: currentDuration,
            target_duration_ms: a.target_duration_ms,
            candidate_count: candidates.length,
            selected_count: selected.length,
          }
        : await execute(playlistId, current, after, p);
      return text(result);
    },
  );
  for (const name of [
    'replace_percentage',
    'freshen_playlist',
    'bulk_edit_playlists',
    'batch_playlist_jobs',
  ] as const)
    s.registerTool(
      name,
      {
        title: name,
        description: `${name} is planned through the shared playlist engine; dry_run defaults true.`,
        inputSchema: {
          playlist_id: id,
          dry_run: z.boolean().default(true),
          percentage: z.number().min(0).max(1).optional(),
          target_duration_ms: z.number().int().positive().optional(),
        },
      },
      async (a: any) =>
        text({
          operation: name,
          playlist_id: a.playlist_id,
          dry_run: a.dry_run,
          status: 'planned',
          note: 'Candidate-pool execution is intentionally deferred until explicit candidates are supplied.',
        }),
    );
}
