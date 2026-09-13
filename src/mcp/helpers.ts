import * as z from 'zod/v4';
import { SpotifyClient } from '../spotify/client.js';
import { parseSpotifyIdentifier } from '../spotify/identifiers.js';
import { chunks } from '../utils/chunks.js';
import { normalizeText, resolveCandidates } from '../spotify/normalize.js';
import { writeChunks } from '../spotify/write-operation.js';
import { TrackResolver } from '../spotify/resolver.js';
import { cancelJob, createJob, getJob, listStateDiagnostics, setJobStatus } from '../db/jobs.js';
import { isDatabaseInitialized } from '../db/database.js';
import { SpotifyApiError } from '../spotify/errors.js';
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
      inputSchema: { track_ids: z.array(id).min(1).max(40) },
    },
    async (a: any) => {
      const inputs = a.track_ids as string[],
        uris = inputs.map((x) => tid(x).uri),
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
    const result: any[] = [];
    const inFlight = new Map<string, Promise<any>>();
    for (const x of list) {
      if (x.id || x.uri) {
        try {
          result.push({ status: 'matched', uri: tid(x.id ?? x.uri).uri, source: x });
        } catch {
          result.push({ status: 'unmatched', source: x });
        }
      } else {
        const key = [
          normalizeText(x.title),
          normalizeText(x.artist),
          normalizeText(x.album ?? ''),
        ].join('\u0000');
        let pending = inFlight.get(key);
        if (!pending) {
          pending = resolver.resolve(x);
          inFlight.set(key, pending);
        }
        let r: any;
        try {
          r = await pending;
        } catch (error) {
          if (error instanceof SpotifyApiError && error.status === 429)
            r = { status: 'waiting', source: 'spotify_search' };
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
  const waitingJob = (type: string, payload: unknown, items: unknown[]) => {
    if (!isDatabaseInitialized()) return undefined;
    const jobId = createJob(type, payload, items);
    setJobStatus(jobId, 'waiting');
    return jobId;
  };
  async function addResolved(a: any, list: any[], dry: boolean) {
    const report = await resolve(list);
    const bad = report.filter((x) => x.status !== 'matched');
    if (report.some((x) => x.status === 'waiting'))
      return {
        ...counts(report, new Set()),
        job_id: waitingJob('add_tracks_by_search', a, list),
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
    return { ...result, report, ...summary, added: result.successfully_written_count };
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
          job_id: waitingJob('bulk_add_tracks', a, a.tracks),
          job_status: 'waiting',
          added: 0,
          blocked: true,
        });
      if (blocked || a.dry_run)
        return text({ report, ...summary, added: 0, dry_run: a.dry_run, blocked });
      const result = await writeChunks(
        'bulk_add_tracks',
        pid(a),
        filtered.map((x) => x.uri),
        async (part) => c.json('/playlists/' + pid(a) + '/items', { uris: part }),
      );
      return text({ ...result, report, ...summary, added: result.successfully_written_count });
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
      },
    },
    async (a: any) => {
      const report = await resolve(a.tracks);
      if (report.some((x) => x.status === 'waiting'))
        return text({
          created: false,
          job_id: waitingJob('create_playlist_from_tracks', a, a.tracks),
          job_status: 'waiting',
          report,
          reason: 'rate_limited',
        });
      if (a.strict && report.some((x) => x.status !== 'matched'))
        return text({ created: false, report, reason: 'resolution_failed' });
      const us = report.filter((x) => x.status === 'matched').map((x) => x.uri);
      const ordered = a.skip_duplicates ? [...new Set(us)] : us;
      const p: any = await c.json('/me/playlists', {
        name: a.name,
        description: a.description ?? '',
        public: a.public,
      });
      const result = await writeChunks('create_playlist_from_tracks', p.id, ordered, async (part) =>
        c.json('/playlists/' + p.id + '/items', { uris: part }),
      );
      return text({
        created: true,
        playlist: p,
        report,
        added: result.successfully_written_count,
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
      'resume_job',
      {
        title: 'Resume job',
        description: 'Make a durable job eligible for processing.',
        inputSchema: { job_id: z.number().int().positive() },
      },
      async (a: any) => {
        setJobStatus(a.job_id, 'pending', Date.now());
        return text({ job_id: a.job_id, job_status: 'pending' });
      },
    );
  if (includeStateTools)
    s.registerTool(
      'commit_job',
      {
        title: 'Commit job',
        description: 'Mark a successfully prepared durable job as completed.',
        inputSchema: { job_id: z.number().int().positive() },
      },
      async (a: any) => {
        setJobStatus(a.job_id, 'completed');
        return text({ job_id: a.job_id, job_status: 'completed' });
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
        inputSchema: {},
      },
      async () => text(listStateDiagnostics()),
    );
}
