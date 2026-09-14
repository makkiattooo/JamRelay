import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDatabase, initializeDatabase } from '../src/db/database.js';
import { latestOperation, loadSnapshot } from '../src/playlists/snapshots.js';
import {
  executePlaylistTransfer,
  syncPlaylistTransfer,
} from '../src/playlists/transfer-execution.js';
import { PlaylistGateway } from '../src/providers/playlist-gateway.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import type { TransferPlan } from '../src/playlists/transfer-planner.js';

let root = '';
afterEach(async () => {
  closeDatabase();
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});

const plan = (items: any[]): TransferPlan => ({
  source_connection_id: 'source',
  source_provider: 'alpha',
  source_playlist_id: 'source-list',
  destination_connection_id: 'destination',
  destination_provider: 'beta',
  source_count: items.length,
  exact_count: items.filter((x) => x.classification === 'exact').length,
  high_confidence_count: items.filter((x) => x.classification === 'high-confidence').length,
  ambiguous_count: items.filter((x) => x.classification === 'ambiguous').length,
  unmatched_count: items.filter((x) => x.classification === 'unmatched').length,
  unavailable_count: 0,
  unsupported_count: 0,
  estimated_provider_calls: 0,
  destination_capability_warnings: [],
  items,
  dry_run: true,
  writes_performed: 0,
});
const source = (position: number, classification: any, destination?: string) => ({
  position,
  source: { id: `source-${position}`, title: `Track ${position}`, artist: 'Artist' },
  classification,
  confidence: classification === 'ambiguous' ? 0.8 : 1,
  reason: classification === 'exact' ? 'verified' : classification,
  evidence: [],
  ...(destination
    ? { destination: { id: destination, title: `Track ${position}`, artist: 'Artist' } }
    : {}),
});

async function setup(initial = ['old']) {
  root = await mkdtemp(join(tmpdir(), 'jamrelay-transfer-execution-'));
  initializeDatabase({ dataDir: root, migrationsDir: join(process.cwd(), 'db/migrations') });
  let items = initial.map((id) => ({
    type: 'track',
    id,
    uri: `beta:track:${id}`,
    name: id,
    artists: [{ name: 'Artist' }],
  }));
  const writes: string[][] = [];
  const registry = new ProviderRegistry();
  const read = {
    listPlaylists: async () => [],
    getPlaylist: async (id: string) => ({ id }),
    getPlaylistTracks: async () => ({ items }),
  };
  registry.register({
    summary: { connectionId: 'source', provider: 'alpha', capabilities: { playlistRead: true } },
    playlistRead: read,
  });
  registry.register({
    summary: {
      connectionId: 'destination',
      provider: 'beta',
      capabilities: { playlistRead: true, playlistWrite: true },
    },
    playlistRead: read,
    playlistWrite: {
      createPlaylist: async () => ({ id: 'new' }),
      addTracks: async () => ({}),
      removeTracks: async () => ({}),
      reorderTracks: async () => ({}),
      replaceTracks: async (_id: string, ids: string[]) => {
        writes.push(ids);
        items = ids.map((id) => ({
          type: 'track',
          id,
          uri: `beta:track:${id}`,
          name: id,
          artists: [{ name: 'Artist' }],
        }));
        return {};
      },
      updatePlaylist: async () => ({}),
    },
  });
  return { registry, gateway: new PlaylistGateway(registry), writes };
}

describe('safe transfer execution and sync', () => {
  it('snapshots, writes only the explicit destination, verifies, and records item outcomes', async () => {
    const ctx = await setup();
    const result = await executePlaylistTransfer({
      plan: plan([source(0, 'exact', 'new-0'), source(1, 'ambiguous'), source(2, 'unmatched')]),
      destinationPlaylistId: 'dest-list',
      registry: ctx.registry,
      gateway: ctx.gateway,
    });
    expect(result.verified).toBe(true);
    expect(result.writes_performed).toBe(1);
    expect(ctx.writes).toEqual([['new-0']]);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.unmatched).toHaveLength(1);
    expect(loadSnapshot(result.before_snapshot_id).connectionId).toBe('destination');
    expect(latestOperation('dest-list', 'destination', 'beta')).toMatchObject({
      status: 'completed',
    });
  });

  it('fails closed for destructive sync conflicts and performs zero writes', async () => {
    const ctx = await setup(['keep', 'extra']);
    const result = await syncPlaylistTransfer({
      plan: plan([source(0, 'exact', 'keep'), source(1, 'ambiguous')]),
      destinationPlaylistId: 'dest-list',
      policy: 'mirror',
      confirm: true,
      registry: ctx.registry,
      gateway: ctx.gateway,
    });
    expect(result.verified).toBe(false);
    expect(result.conflicts).toContain('unresolved_source_items_block_destructive_sync');
    expect(result.writes_performed).toBe(0);
    expect(ctx.writes).toHaveLength(0);
  });

  it('rejects a provider/connection mismatch instead of falling back', async () => {
    const ctx = await setup();
    await expect(
      executePlaylistTransfer({
        plan: { ...plan([source(0, 'exact', 'x')]), destination_provider: 'alpha' },
        destinationPlaylistId: 'dest-list',
        registry: ctx.registry,
        gateway: ctx.gateway,
      }),
    ).rejects.toThrow();
    expect(ctx.writes).toHaveLength(0);
  });

  it('can be resumed idempotently without appending duplicate successful items', async () => {
    const ctx = await setup([]);
    const transferPlan = plan([source(0, 'exact', 'same-id')]);
    await executePlaylistTransfer({
      plan: transferPlan,
      destinationPlaylistId: 'dest-list',
      registry: ctx.registry,
      gateway: ctx.gateway,
    });
    const resumed = await executePlaylistTransfer({
      plan: transferPlan,
      destinationPlaylistId: 'dest-list',
      registry: ctx.registry,
      gateway: ctx.gateway,
      resumed: true,
    });
    expect(resumed.verified).toBe(true);
    expect(ctx.writes).toEqual([['same-id'], ['same-id']]);
  });
});
