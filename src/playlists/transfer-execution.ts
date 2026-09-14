import { createHash, randomUUID } from 'node:crypto';
import type { ProviderRegistry } from '../providers/registry.js';
import { ProviderSelectionError } from '../providers/errors.js';
import { PlaylistGateway } from '../providers/playlist-gateway.js';
import type { TransferPlan, TransferItem } from './transfer-planner.js';
import { saveOperation, saveSnapshot } from './snapshots.js';

export type { TransferPlan } from './transfer-planner.js';

export type TransferSyncPolicy = 'mirror' | 'append_missing' | 'remove_extra' | 'two_way_union';
export type TransferItemResult = {
  position: number;
  source_id: string | null;
  destination_id: string | null;
  status: 'completed' | 'skipped' | 'failed';
  reason?: string;
};

export type TransferExecutionResult = {
  operation_id: string;
  before_snapshot_id: string;
  after_snapshot_id: string | null;
  plan_fingerprint: string;
  destination_connection_id: string;
  destination_provider: string;
  policy: 'transfer' | TransferSyncPolicy;
  item_results: TransferItemResult[];
  ambiguous: TransferItem[];
  unmatched: TransferItem[];
  conflicts: string[];
  verified: boolean;
  writes_performed: number;
  resumed: boolean;
};

const eligible = (item: TransferItem) =>
  (item.classification === 'exact' || item.classification === 'high-confidence') &&
  Boolean(item.destination?.id);
const planCore = (plan: TransferPlan) => ({
  source_connection_id: plan.source_connection_id,
  source_provider: plan.source_provider,
  source_playlist_id: plan.source_playlist_id,
  destination_connection_id: plan.destination_connection_id,
  destination_provider: plan.destination_provider,
  items: plan.items,
});
export const transferPlanFingerprint = (plan: TransferPlan) =>
  createHash('sha256')
    .update(JSON.stringify(planCore(plan)))
    .digest('hex');

const pageItems = (value: any): any[] =>
  Array.isArray(value) ? value : (value?.data?.items ?? value?.items ?? []);
const itemId = (value: any): string | null => {
  const x = value?.item ?? value?.track ?? value;
  return x?.id == null ? null : String(x.id);
};
const itemUri = (value: any): string | null => {
  const x = value?.item ?? value?.track ?? value;
  return x?.uri ?? x?.metadata?.providerUri ?? (x?.id == null ? null : String(x.id));
};
const ensurePlan = (plan: TransferPlan, connectionId: string, provider: string) => {
  if (!plan?.dry_run || plan.writes_performed !== 0)
    throw new Error('transfer_plan_must_be_dry_run');
  if (plan.destination_connection_id !== connectionId || plan.destination_provider !== provider)
    throw new Error('transfer_destination_conflict');
  if (plan.plan_fingerprint && plan.plan_fingerprint !== transferPlanFingerprint(plan))
    throw new Error('transfer_plan_changed');
  if (!Array.isArray(plan.items)) throw new Error('transfer_plan_invalid');
};

const destinationState = async (gateway: PlaylistGateway, playlistId: string, target: any) => {
  const playlist = await gateway.get(playlistId, target);
  const items = await gateway.items(playlistId, target);
  return { playlist, items: pageItems(items) };
};

const snapshotDestination = (
  playlistId: string,
  provider: string,
  connectionId: string,
  state: any,
  reason: string,
) =>
  saveSnapshot({
    playlistId,
    providerPlaylistId: playlistId,
    providerId: provider,
    connectionId,
    providerRevision: state.playlist?.data?.snapshot_id ?? state.playlist?.snapshot_id ?? null,
    metadata: { playlist: state.playlist, provenance: { provider, connectionId } },
    uris: state.items.map((item: any) => itemUri(item) ?? ''),
    trackRefs: state.items.map((x: any) => ({
      providerTrackId: itemId(x),
      providerUri: itemUri(x) ?? undefined,
    })),
    reason,
  });

const validateDestination = (
  registry: ProviderRegistry,
  provider: string,
  connectionId: string,
) => {
  const connection = registry.getConnection(connectionId);
  if (!connection || connection.summary.provider !== provider)
    throw new ProviderSelectionError(
      'The requested destination connection is unavailable.',
      'write',
      [connectionId],
    );
  if (
    connection.summary.connected === false ||
    !connection.playlistRead ||
    !connection.playlistWrite
  )
    throw new Error('destination_playlist_capability_unsupported');
};

export async function executePlaylistTransfer(input: {
  plan: TransferPlan;
  destinationPlaylistId: string;
  registry: ProviderRegistry;
  gateway?: PlaylistGateway;
  resumed?: boolean;
  trackIdsOverride?: string[];
}): Promise<TransferExecutionResult> {
  const { plan, destinationPlaylistId, registry } = input;
  validateDestination(registry, plan.destination_provider, plan.destination_connection_id);
  ensurePlan(plan, plan.destination_connection_id, plan.destination_provider);
  const gateway = input.gateway ?? new PlaylistGateway(registry);
  const target = {
    connection_id: plan.destination_connection_id,
    provider: plan.destination_provider,
  };
  const before = await destinationState(gateway, destinationPlaylistId, target);
  const beforeSnapshot = snapshotDestination(
    destinationPlaylistId,
    plan.destination_provider,
    plan.destination_connection_id,
    before,
    'transfer-before',
  );
  const good = plan.items.filter(eligible);
  const expected = input.trackIdsOverride ?? good.map((x) => x.destination!.id);
  const results = plan.items.map((item) => ({
    position: item.position,
    source_id: item.source.id,
    destination_id: item.destination?.id ?? null,
    status: eligible(item) ? ('completed' as const) : ('skipped' as const),
    ...(eligible(item) ? {} : { reason: item.reason }),
  }));
  try {
    await gateway.replace(destinationPlaylistId, expected, target);
    const after = await destinationState(gateway, destinationPlaylistId, target);
    const actual = after.items.map(itemId);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('transfer_verification_failed');
    const afterSnapshot = snapshotDestination(
      destinationPlaylistId,
      plan.destination_provider,
      plan.destination_connection_id,
      after,
      'transfer-after',
    );
    const operationId = `op_${randomUUID()}`;
    saveOperation({
      id: operationId,
      playlistId: destinationPlaylistId,
      operation: 'transfer',
      beforeSnapshotId: beforeSnapshot.id,
      afterSnapshotId: afterSnapshot.id,
      plan,
      status: 'completed',
      providerId: plan.destination_provider,
      connectionId: plan.destination_connection_id,
    });
    return {
      operation_id: operationId,
      before_snapshot_id: beforeSnapshot.id,
      after_snapshot_id: afterSnapshot.id,
      plan_fingerprint: transferPlanFingerprint(plan),
      destination_connection_id: plan.destination_connection_id,
      destination_provider: plan.destination_provider,
      policy: 'transfer',
      item_results: results,
      ambiguous: plan.items.filter((x) => x.classification === 'ambiguous'),
      unmatched: plan.items.filter((x) =>
        ['unmatched', 'unavailable', 'unsupported'].includes(x.classification),
      ),
      conflicts: [],
      verified: true,
      writes_performed: expected.length ? 1 : 0,
      resumed: Boolean(input.resumed),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'transfer_write_failed';
    return {
      operation_id: `op_${randomUUID()}`,
      before_snapshot_id: beforeSnapshot.id,
      after_snapshot_id: null,
      plan_fingerprint: transferPlanFingerprint(plan),
      destination_connection_id: plan.destination_connection_id,
      destination_provider: plan.destination_provider,
      policy: 'transfer',
      item_results: results.map((x) =>
        eligible(plan.items.find((i) => i.position === x.position)!)
          ? { ...x, status: 'failed' as const, reason: message }
          : x,
      ),
      ambiguous: plan.items.filter((x) => x.classification === 'ambiguous'),
      unmatched: plan.items.filter((x) =>
        ['unmatched', 'unavailable', 'unsupported'].includes(x.classification),
      ),
      conflicts: [message],
      verified: false,
      writes_performed: expected.length ? 1 : 0,
      resumed: Boolean(input.resumed),
    };
  }
}

export async function syncPlaylistTransfer(input: {
  plan: TransferPlan;
  destinationPlaylistId: string;
  policy: TransferSyncPolicy;
  registry: ProviderRegistry;
  gateway?: PlaylistGateway;
  confirm?: boolean;
}): Promise<TransferExecutionResult> {
  if (input.confirm !== true) throw new Error('sync_confirmation_required');
  const { plan, destinationPlaylistId, registry, policy } = input;
  validateDestination(registry, plan.destination_provider, plan.destination_connection_id);
  ensurePlan(plan, plan.destination_connection_id, plan.destination_provider);
  const gateway = input.gateway ?? new PlaylistGateway(registry);
  const target = {
    connection_id: plan.destination_connection_id,
    provider: plan.destination_provider,
  };
  const before = await destinationState(gateway, destinationPlaylistId, target);
  const beforeIds = before.items.map(itemId).filter((x): x is string => Boolean(x));
  const desired = plan.items.filter(eligible).map((x) => x.destination!.id);
  const unresolved = plan.items.filter((x) =>
    ['ambiguous', 'unmatched', 'unavailable', 'unsupported'].includes(x.classification),
  );
  const conflicts =
    unresolved.length && (policy === 'mirror' || policy === 'remove_extra')
      ? ['unresolved_source_items_block_destructive_sync']
      : [];
  if (conflicts.length) {
    return {
      operation_id: `op_${randomUUID()}`,
      before_snapshot_id: snapshotDestination(
        destinationPlaylistId,
        plan.destination_provider,
        plan.destination_connection_id,
        before,
        'sync-conflict-before',
      ).id,
      after_snapshot_id: null,
      plan_fingerprint: transferPlanFingerprint(plan),
      destination_connection_id: plan.destination_connection_id,
      destination_provider: plan.destination_provider,
      item_results: plan.items.map((item) => ({
        position: item.position,
        source_id: item.source.id,
        destination_id: item.destination?.id ?? null,
        status: 'skipped' as const,
        reason: 'sync conflict; no destructive write performed',
      })),
      ambiguous: plan.items.filter((x) => x.classification === 'ambiguous'),
      unmatched: plan.items.filter((x) =>
        ['unmatched', 'unavailable', 'unsupported'].includes(x.classification),
      ),
      policy,
      conflicts,
      verified: false,
      writes_performed: 0,
      resumed: false,
    };
  }
  const next =
    policy === 'append_missing' || policy === 'two_way_union'
      ? [...beforeIds, ...desired.filter((x) => !beforeIds.includes(x))]
      : policy === 'remove_extra'
        ? beforeIds.filter((x) => desired.includes(x))
        : desired;
  const syncPlan = { ...plan, items: plan.items };
  return executePlaylistTransfer({
    plan: syncPlan,
    destinationPlaylistId,
    registry,
    gateway,
    resumed: false,
    trackIdsOverride: next,
  }).then((result) => ({ ...result, policy }));
}
