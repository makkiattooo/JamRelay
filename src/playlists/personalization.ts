import * as z from 'zod/v4';
import type { PlaylistGateway } from '../providers/playlist-gateway.js';
import { PlaylistStateReader, invalidatePlaylistStateCache } from './state-reader.js';
import { normalizePlaylistItems } from './normalize.js';
import { rankTracks } from './affinity.js';
import { listHistory, ingestPlayback, stableSeed, historyStats } from './history.js';
import { seededShuffle, violations } from './shuffle.js';
import { saveSnapshot } from './snapshots.js';
const id = z.string().min(1),
  text = (x: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(x) }],
    structuredContent: x,
  });
export const PLAYLIST_PERSONALIZATION_TOOL_NAMES = [
  'session_history',
  'rank_playlist_tracks',
  'sort_by_personal_affinity',
  'personalize_playlist',
  'avoid_recently_played',
  'compare_playlists',
  'build_session_queue',
  'smart_next',
  'archive_playlist',
] as const;
export function registerPlaylistPersonalizationTools(s: any, playlists: PlaylistGateway) {
  const stateReader = new PlaylistStateReader(playlists);
  const state = async (v: string, options: Record<string, unknown> = {}) => {
    const idv = v,
      result = await stateReader.read(idv, options);
    return {
      id: idv,
      meta: result.playlist as any,
      raw: result.items,
      ...normalizePlaylistItems(result.items),
      state_provenance: result.provenance,
      provider_revision: result.providerRevision,
      provider_calls: result.metrics.providerCalls,
    };
  };
  s.registerTool(
    'session_history',
    {
      title: 'Session history',
      description:
        'Read locally observed playback history with provenance; does not claim complete Spotify history.',
      inputSchema: {
        since: z.number().int().optional(),
        until: z.number().int().optional(),
        limit: z.number().int().min(1).max(1000).default(100),
        artist: z.string().optional(),
        track: z.string().optional(),
        source: z.string().optional(),
      },
    },
    async (a: any) => text(listHistory(a)),
  );
  s.registerTool(
    'rank_playlist_tracks',
    {
      title: 'Rank playlist tracks',
      description:
        'Read-only explainable local affinity/freshness ranking; no Spotify popularity fallback.',
      inputSchema: {
        playlist_id: id,
        ranking_mode: z
          .enum(['affinity', 'freshness', 'rediscovery', 'recent_frequency'])
          .default('affinity'),
      },
    },
    async (a: any) => {
      const x = await state(a.playlist_id, a),
        ranked = rankTracks(x.tracks, a.ranking_mode);
      return text({
        tracks: ranked.map((r, i) => ({
          rank: i + 1,
          track: r.track,
          score: r.score,
          score_components: r.components,
          evidence: r.evidence,
        })),
        unavailable_signals: ['saved-track membership is not yet synchronized into local evidence'],
      });
    },
  );
  const execute = async (
    a: any,
    x: Awaited<ReturnType<typeof state>>,
    after: typeof x.tracks,
    reason: string,
  ) => {
    if (after.some((t) => !t.id)) throw new Error('playlist_contains_unsupported_items');
    const target = {
      provider: x.state_provenance.provider,
      connection_id: x.state_provenance.connectionId,
    };
    const snapshot = saveSnapshot({
      playlistId: x.id,
      providerId: target.provider,
      connectionId: target.connection_id,
      providerRevision: x.provider_revision,
      metadata: x.meta,
      uris: x.tracks.map((t) => t.uri ?? t.id!).filter(Boolean),
      reason,
    });
    await playlists.replace(
      x.id,
      after.map((t) => t.id!),
      target,
    );
    invalidatePlaylistStateCache(x.id, target);
    const verified = await state(x.id, target);
    if (
      verified.tracks.length !== after.length ||
      verified.tracks.some((t, i) => t.id !== after[i]?.id)
    )
      throw new Error('playlist_integrity_mismatch');
    return { safety_snapshot_id: snapshot.id, verification: { ok: true, count: after.length } };
  };
  const layout = async (
    a: any,
    mode: 'affinity' | 'freshness' | 'rediscovery' | 'recent_frequency',
  ) => {
    const x = await state(a.playlist_id, a),
      ranked = rankTracks(x.tracks, mode),
      after = (a.direction === 'lowest_first' ? [...ranked].reverse() : ranked).map((r) => r.track),
      warnings = ranked.every(
        (r) => r.evidence.length === 1 && r.evidence[0] === 'no local playback evidence',
      )
        ? ['low_data: no locally observed playback evidence']
        : [],
      uris = after.map((t) => t.uri!).filter(Boolean);
    if (a.dry_run !== false)
      return text({
        before_count: x.tracks.length,
        after_count: after.length,
        moved_tracks: after
          .map((t, i) => ({ uri: t.uri, from: t.originalIndex, to: i }))
          .filter((m) => m.from !== m.to),
        warnings,
        seed: a.seed,
      });
    return text({ ...(await execute(a, x, after, mode)), warnings });
  };
  s.registerTool(
    'sort_by_personal_affinity',
    {
      title: 'Sort by personal affinity',
      description:
        'Plan or reorder using local evidence only; dry_run defaults true and snapshots on execution.',
      inputSchema: {
        playlist_id: id,
        direction: z.enum(['highest_first', 'lowest_first']).default('highest_first'),
        dry_run: z.boolean().default(true),
        preserve_artist_spacing: z.boolean().default(false),
        min_artist_gap: z.number().int().min(0).max(100).default(1),
      },
    },
    async (a: any) => {
      return layout(a, 'affinity');
    },
  );
  s.registerTool(
    'personalize_playlist',
    {
      title: 'Personalize playlist',
      description:
        'Deterministic local personalization combining affinity and artist spacing; dry_run defaults true.',
      inputSchema: {
        playlist_id: id,
        dry_run: z.boolean().default(true),
        min_artist_gap: z.number().int().min(0).max(100).default(1),
        seed: z.number().int().optional(),
      },
    },
    async (a: any) => {
      const x = await state(a.playlist_id, a),
        ranked = rankTracks(x.tracks, 'affinity'),
        after = seededShuffle(
          ranked.map((r) => r.track),
          { seed: a.seed ?? stableSeed(JSON.stringify(a)), minArtistGap: a.min_artist_gap },
        );
      return text({
        ...(!a.dry_run ? await execute(a, x, after, 'personalize') : {}),
        before_count: x.tracks.length,
        after_count: after.length,
        tracks_moved: after
          .map((t, i) => ({ uri: t.uri, from: t.originalIndex, to: i }))
          .filter((m) => m.from !== m.to),
        low_data_warning: ranked.every((r) => r.evidence[0] === 'no local playback evidence'),
        seed: a.seed ?? stableSeed(JSON.stringify(a)),
        dry_run: a.dry_run,
      });
    },
  );
  s.registerTool(
    'avoid_recently_played',
    {
      title: 'Avoid recently played',
      description: 'Uses only locally observed history; dry_run defaults true.',
      inputSchema: {
        playlist_id: id,
        lookback_hours: z.number().positive().optional(),
        lookback_days: z.number().positive().optional(),
        behavior: z.enum(['remove', 'move_to_end', 'deprioritize']),
        dry_run: z.boolean().default(true),
      },
    },
    async (a: any) => {
      const x = await state(a.playlist_id, a),
        since = Date.now() - (a.lookback_hours ?? (a.lookback_days ?? 1) * 24) * 3600000,
        h = listHistory({ since, limit: 1000 }),
        ids = new Set(
          h.flatMap((e: any) =>
            [e.trackId, e.providerTrackId, e.spotifyTrackId].filter((v) => v != null),
          ),
        ),
        affected = x.tracks.filter(
          (t) =>
            t.id && (ids.has(t.id) || (t.canonicalTrackId != null && ids.has(t.canonicalTrackId))),
        ),
        after =
          a.behavior === 'remove'
            ? x.tracks.filter((t) => !affected.includes(t))
            : [...x.tracks.filter((t) => !affected.includes(t)), ...affected];
      return text({
        ...(!a.dry_run ? await execute(a, x, after, 'avoid_recently_played') : {}),
        recently_played: h,
        affected_tracks: affected.map((t) => t.uri),
        incomplete_history_warning:
          'History only contains events observed or synchronized by JamRelay.',
        resulting_count: after.length,
        dry_run: a.dry_run,
      });
    },
  );
  s.registerTool(
    'compare_playlists',
    {
      title: 'Compare playlists',
      description: 'Read-only efficient URI, artist, album and duration comparison.',
      inputSchema: { playlist_id_a: id, playlist_id_b: id },
    },
    async (a: any) => {
      const [x, y] = await Promise.all([state(a.playlist_id_a, a), state(a.playlist_id_b, a)]),
        xs = new Set(x.tracks.map((t) => t.canonicalTrackId ?? t.uri)),
        ys = new Set(y.tracks.map((t) => t.canonicalTrackId ?? t.uri));
      return text({
        only_in_a: x.tracks.filter((t) => !ys.has(t.canonicalTrackId ?? t.uri)),
        only_in_b: y.tracks.filter((t) => !xs.has(t.canonicalTrackId ?? t.uri)),
        common_count: [...xs].filter((u) => ys.has(u)).length,
        artist_overlap: [...new Set(x.tracks.map((t) => t.normalizedArtist))].filter((v) =>
          new Set(y.tracks.map((t) => t.normalizedArtist)).has(v),
        ),
        album_overlap: [...new Set(x.tracks.map((t) => t.normalizedAlbum))].filter((v) =>
          new Set(y.tracks.map((t) => t.normalizedAlbum)).has(v),
        ),
        duration_ms: {
          a: x.tracks.reduce((n, t) => n + (t.durationMs ?? 0), 0),
          b: y.tracks.reduce((n, t) => n + (t.durationMs ?? 0), 0),
        },
      });
    },
  );
  s.registerTool(
    'build_session_queue',
    {
      title: 'Build session queue',
      description:
        'Read-only deterministic queue plan from a playlist; never writes Spotify queue.',
      inputSchema: {
        playlist_id: id,
        max_tracks: z.number().int().min(1).max(1000).optional(),
        target_duration_minutes: z.number().positive().optional(),
        min_artist_gap: z.number().int().min(0).max(100).default(1),
        seed: z.number().int().optional(),
      },
    },
    async (a: any) => {
      const x = await state(a.playlist_id, a),
        q = seededShuffle(x.tracks, { seed: a.seed ?? 1, minArtistGap: a.min_artist_gap });
      let out: typeof q = [];
      for (const t of q) {
        if (a.max_tracks && out.length >= a.max_tracks) break;
        if (
          a.target_duration_minutes &&
          out.reduce((n, v) => n + (v.durationMs ?? 0), 0) + (t.durationMs ?? 0) >
            a.target_duration_minutes * 60000
        )
          continue;
        out.push(t);
      }
      return text({
        tracks: out,
        track_count: out.length,
        duration_ms: out.reduce((n, t) => n + (t.durationMs ?? 0), 0),
        seed: a.seed ?? 1,
      });
    },
  );
  s.registerTool(
    'smart_next',
    {
      title: 'Smart next',
      description:
        'Selects from a supplied playlist using local evidence; does not start playback.',
      inputSchema: {
        playlist_id: id,
        min_artist_gap: z.number().int().min(0).max(100).default(1),
        seed: z.number().int().optional(),
      },
    },
    async (a: any) => {
      const x = await state(a.playlist_id, a),
        r = rankTracks(x.tracks, 'affinity');
      return text({
        selected_track: r[0]?.track,
        ranked_alternatives: r.slice(1, 10),
        reasoning: r[0]?.evidence ?? ['no local evidence'],
      });
    },
  );
  s.registerTool(
    'archive_playlist',
    {
      title: 'Archive playlist',
      description: 'Persist an immutable local snapshot/version; no provider mutation.',
      inputSchema: { playlist_id: id, label: z.string().max(200).optional() },
    },
    async (a: any) => {
      const x = await state(a.playlist_id, a),
        snap = saveSnapshot({
          playlistId: x.id,
          providerId: a.provider ?? 'spotify',
          connectionId: a.connection_id ?? 'spotify-default',
          spotifySnapshotId: x.meta?.snapshot_id,
          metadata: x.meta,
          uris: x.tracks.map((t) => t.uri!).filter(Boolean),
          reason: a.label ?? 'archive',
        });
      return text({ archive_snapshot_id: snap.id, track_count: snap.trackCount, label: a.label });
    },
  );
}
