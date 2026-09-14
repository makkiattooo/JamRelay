import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';
import { recordRateLimit, upsertTrackProviderMapping } from '../src/db/state.js';
import { planPlaylistTransfer } from '../src/playlists/transfer-planner.js';
import type { MusicCandidate } from '../src/music/normalize.js';

let root = '';
afterEach(async () => {
  closeDatabase();
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});
async function setup() {
  root = await mkdtemp(join(tmpdir(), 'jamrelay-transfer-'));
  initializeDatabase({ dataDir: root, migrationsDir: join(process.cwd(), 'db/migrations') });
  getDatabase()
    .prepare(
      'INSERT INTO tracks (spotify_track_id,spotify_uri,title,artist,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    )
    .run('source-1', 'spotify:track:source-1', 'Shared', 'Artist', 'test', 1, 1);
  upsertTrackProviderMapping({
    trackId: 1,
    providerId: 'spotify',
    connectionId: 'spotify-main',
    providerTrackId: 'source-1',
  });
}
const item = (id: string, name: string, artist = 'Artist', extra: any = {}) => ({
  type: 'track',
  id,
  uri: `${extra.provider ?? 'spotify'}:track:${id}`,
  name,
  artists: [{ name: artist }],
  ...extra,
});
const candidate = (
  id: string,
  name: string,
  artist = 'Artist',
  metadata: Record<string, unknown> = {},
): MusicCandidate => ({ id, name, artists: [{ name: artist }], metadata });
async function run(
  sourceTracks: any[],
  searchTracks: (query: string, options: Record<string, unknown>) => Promise<MusicCandidate[]>,
  extra: any = {},
) {
  return planPlaylistTransfer({
    sourceTracks,
    sourceProvider: 'spotify',
    sourceConnectionId: 'spotify-main',
    sourcePlaylistId: 'source-playlist',
    destinationProvider: 'soundcloud',
    destinationConnectionId: 'soundcloud-main',
    destinationPlaylistWriteSupported: true,
    destinationCatalogSupported: true,
    searchTracks,
    ...extra,
  });
}

describe('dry-run cross-provider transfer planner', () => {
  it('uses a verified destination mapping as an exact match without a catalog call', async () => {
    await setup();
    upsertTrackProviderMapping({
      trackId: 1,
      providerId: 'soundcloud',
      connectionId: 'soundcloud-main',
      providerTrackId: '99',
      providerUri: 'soundcloud:track:99',
    });
    const search = vi.fn();
    const plan = await run([item('source-1', 'Shared')], search);
    expect(plan.items[0]).toMatchObject({ classification: 'exact', destination: { id: '99' } });
    expect(search).not.toHaveBeenCalled();
    expect(plan.writes_performed).toBe(0);
  });

  it('classifies ISRC and normalized title/artist matches with evidence', async () => {
    await setup();
    const isrcPlan = await run(
      [item('unmapped', 'Shared', 'Artist', { external_ids: { isrc: 'US-1' } })],
      async () => [candidate('42', 'Shared', 'Artist', { isrc: 'US-1' })],
    );
    expect(isrcPlan.items[0]).toMatchObject({
      classification: 'exact',
      evidence: ['ISRC exact match'],
    });
    const fallbackPlan = await run([item('unmapped-2', 'Another Song')], async () => [
      candidate('43', 'Another Song'),
    ]);
    expect(fallbackPlan.items[0].classification).toBe('high-confidence');
    expect(fallbackPlan.items[0].evidence).toContain('normalized title/artist match');
  });

  it('does not auto-select ambiguous versions', async () => {
    await setup();
    const plan = await run([item('unmapped', 'Song')], async () => [
      candidate('1', 'Song (Live)'),
      candidate('2', 'Song (Remix)'),
    ]);
    expect(plan.items[0].classification).toBe('ambiguous');
    expect(plan.items[0].candidates).toHaveLength(2);
  });

  it('reports unsupported and rate-limited destinations without writes', async () => {
    await setup();
    let writes = 0;
    const unsupported = await run(
      [item('unmapped', 'Song')],
      async () => {
        writes++;
        return [];
      },
      { destinationCatalogSupported: false },
    );
    expect(unsupported.items[0].classification).toBe('unsupported');
    recordRateLimit('soundcloud', 'catalog', 60, 'test', 'soundcloud-main');
    const limited = await run([item('unmapped-2', 'Song')], async () => {
      writes++;
      return [];
    });
    expect(limited.items[0].classification).toBe('unavailable');
    expect(limited.items[0].evidence).toContain('destination catalog rate limit');
    expect(writes).toBe(0);
    expect(limited.writes_performed).toBe(0);
  });
});
