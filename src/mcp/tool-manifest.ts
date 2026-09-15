import { PLAYLIST_AUTOMATION_TOOL_NAMES } from '../playlists/automation.js';
import { PLAYLIST_PERSONALIZATION_TOOL_NAMES } from '../playlists/personalization.js';

export type ToolExecutionClass =
  'interactive_read' | 'interactive_write' | 'heavy_read' | 'heavy_write';

export type ToolSecurityMetadata = {
  permission: string;
  readOnly: boolean;
  destructive: boolean;
  idempotent: boolean;
  executionClass: ToolExecutionClass;
};

const heavy = new Set([
  'execute_playlist_transfer',
  'sync_playlist_transfer',
  'create_bulk_job',
  'commit_job',
  'add_tracks_by_search',
  'bulk_add_tracks',
  'create_playlist_from_tracks',
]);

const destructive = new Set([
  'execute_playlist_transfer',
  'sync_playlist_transfer',
  'remove_tracks_from_playlist',
  'replace_playlist_tracks',
  'deduplicate_playlist',
  'remove_saved_tracks',
  'restore_playlist_snapshot',
  'undo_last_playlist_change',
  'semantic_deduplicate_playlist',
  'smart_shuffle_playlist',
  'balance_artists',
  'limit_artist_share',
  'smart_insert_tracks',
  'optimize_playlist',
  'archive_playlist',
  'playlist_versioning',
  'playlist_skip_cleanup',
  'liked_to_playlist_sync',
]);

const readOnly = new Set([
  'get_connections',
  'get_capabilities',
  'search_tracks',
  'search_artists',
  'search_albums',
  'get_track',
  'get_artist',
  'get_playlist_stats',
  'get_my_playlists',
  'get_playlist',
  'get_playlist_tracks',
  'get_playlist_chapters',
  'chapterize_playlist',
  'get_top_tracks',
  'get_top_artists',
  'get_recently_played',
  'get_saved_tracks',
  'check_saved_tracks',
  'find_track_exact',
  'find_playlist_by_name',
  'remember_track',
  'get_currently_playing',
  'get_playback_state',
  'get_devices',
  'get_state_diagnostics',
  'get_rate_limit_status',
  'get_recent_api_errors',
  'get_job_status',
  'list_jobs',
  'plan_playlist_transfer',
  'playlist_rules_engine',
  'estimate_operation_cost',
  'session_history',
  'rank_playlist_tracks',
  'compare_playlists',
  'build_session_queue',
  'smart_next',
  'skip_pattern_report',
  'rediscover_old_tracks',
  'deep_cuts_mode',
  'find_missing_favorites',
  'complete_artist_collection',
  'playlist_diff',
  'playlist_health_report',
  'verify_playlist_integrity',
  'dry_run_playlist_operation',
  'export_playlist',
]);

const catalog = new Set([
  'search_tracks',
  'search_artists',
  'search_albums',
  'get_track',
  'get_artist',
  'get_playlist_stats',
]);
const libraryRead = new Set([
  'get_top_tracks',
  'get_top_artists',
  'get_recently_played',
  'get_saved_tracks',
  'check_saved_tracks',
  'find_track_exact',
  'remember_track',
]);
const playbackRead = new Set(['get_currently_playing', 'get_playback_state', 'get_devices']);
const playbackControl = new Set([
  'play',
  'pause',
  'next_track',
  'previous_track',
  'seek',
  'set_volume',
  'transfer_playback',
  'play_playlist_chapter',
  'resume_playlist_chapter',
]);
const libraryWrite = new Set(['save_tracks', 'remove_saved_tracks']);
const playlistRead = new Set([
  'get_my_playlists',
  'get_playlist',
  'get_playlist_tracks',
  'get_playlist_chapters',
  'chapterize_playlist',
  'playlist_rules_engine',
  'estimate_operation_cost',
  'playlist_diff',
  'playlist_health_report',
  'verify_playlist_integrity',
  'dry_run_playlist_operation',
  'export_playlist',
  'get_job_status',
  'list_jobs',
]);
const diagnosticsRead = new Set([
  'get_connections',
  'get_capabilities',
  'get_state_diagnostics',
  'get_rate_limit_status',
  'get_recent_api_errors',
]);

const explicitlyRegistered = new Set([
  'add_tracks_by_search',
  'add_tracks_to_playlist',
  'apply_playlist_recipe',
  'balance_artists',
  'bulk_add_tracks',
  'cancel_job',
  'chapterize_playlist',
  'check_saved_tracks',
  'clone_playlist',
  'commit_job',
  'create_bulk_job',
  'create_playlist',
  'create_playlist_from_tracks',
  'deduplicate_playlist',
  'dry_run_playlist_operation',
  'estimate_operation_cost',
  'execute_playlist_transfer',
  'export_playlist',
  'extend_playlist_to_duration',
  'filter_playlist',
  'find_playlist_by_name',
  'find_track_exact',
  'get_artist_top_tracks',
  'get_capabilities',
  'get_connections',
  'get_currently_playing',
  'get_devices',
  'get_job_status',
  'get_my_playlists',
  'get_playback_state',
  'get_playlist',
  'get_playlist_chapters',
  'get_playlist_stats',
  'get_playlist_tracks',
  'get_rate_limit_status',
  'get_recent_api_errors',
  'get_recently_played',
  'get_saved_tracks',
  'get_state_diagnostics',
  'limit_artist_share',
  'list_jobs',
  'merge_playlists_smart',
  'optimize_playlist',
  'pause',
  'plan_playlist_transfer',
  'play',
  'play_playlist_chapter',
  'playlist_diff',
  'playlist_health_report',
  'playlist_recipe',
  'playlist_rules_engine',
  'playlist_trim_to_duration',
  'preview_playlist_import',
  'import_playlist',
  'previous_track',
  'reorder_playlist_tracks',
  'remove_tracks_from_playlist',
  'replace_playlist_tracks',
  'replace_percentage',
  'remember_track',
  'restore_playlist_snapshot',
  'resume_job',
  'resume_playlist_chapter',
  'seek',
  'semantic_deduplicate_playlist',
  'set_volume',
  'smart_insert_tracks',
  'smart_shuffle_playlist',
  'snapshot_playlist',
  'split_playlist_balanced',
  'sync_playlist_transfer',
  'sync_playlists',
  'transfer_playback',
  'undo_last_playlist_change',
  'update_playlist_details',
  'verify_playlist_integrity',
  'save_tracks',
  'remove_saved_tracks',
  'next_track',
  'search_tracks',
  'search_artists',
  'search_albums',
  'get_track',
  'get_artist',
  'get_top_tracks',
  'get_top_artists',
]);

const permissionFor = (name: string): string => {
  if (catalog.has(name)) return 'catalog.read';
  if (libraryRead.has(name)) return 'library.read';
  if (playbackRead.has(name)) return 'playback.read';
  if (playbackControl.has(name)) return 'playback.control';
  if (libraryWrite.has(name)) return 'library.write';
  if (diagnosticsRead.has(name)) return 'diagnostics.read';
  if (playlistRead.has(name)) return 'playlist.read';
  if (name === 'plan_playlist_transfer') return 'transfer.plan';
  if (name === 'execute_playlist_transfer' || name === 'sync_playlist_transfer')
    return 'transfer.execute';
  if (
    [
      'create_bulk_job',
      'resume_job',
      'commit_job',
      'cancel_job',
      'create_playlist',
      'add_tracks_to_playlist',
      'update_playlist_details',
      'reorder_playlist_tracks',
    ].includes(name)
  )
    return 'playlist.write';
  if (destructive.has(name)) return 'playlist.destructive';
  if (PLAYLIST_AUTOMATION_TOOL_NAMES.includes(name as never)) return 'playlist.write';
  if (PLAYLIST_PERSONALIZATION_TOOL_NAMES.includes(name as never))
    return readOnly.has(name) ? 'personalization.read' : 'playlist.write';
  return 'playlist.write';
};

export function getToolSecurityMetadata(name: string): ToolSecurityMetadata | undefined {
  if (!hasToolSecurityMetadata(name)) return undefined;
  const isReadOnly = readOnly.has(name);
  const isDestructive = destructive.has(name);
  const permission = permissionFor(name);
  const isHeavy = heavy.has(name);
  return {
    permission,
    readOnly: isReadOnly,
    destructive: isDestructive,
    idempotent:
      isReadOnly &&
      ['get_track', 'get_artist', 'get_playlist', 'get_playback_state', 'get_devices'].includes(
        name,
      ),
    executionClass:
      `${isHeavy ? 'heavy' : 'interactive'}_${isReadOnly ? 'read' : 'write'}` as ToolExecutionClass,
  };
}

export function hasToolSecurityMetadata(name: string): boolean {
  return (
    explicitlyRegistered.has(name) ||
    [...PLAYLIST_AUTOMATION_TOOL_NAMES, ...PLAYLIST_PERSONALIZATION_TOOL_NAMES].includes(
      name as never,
    )
  );
}
