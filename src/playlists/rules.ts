import type { NormalizedPlaylistTrack } from './types.js';

export type PlaylistRule =
  | { type: 'min_artist_gap'; value: number }
  | { type: 'max_artist_share'; value: number }
  | { type: 'max_tracks_per_artist'; value: number }
  | { type: 'exclude_artists'; values: string[] }
  | { type: 'require_artists'; values: string[] }
  | { type: 'min_album_gap'; value: number }
  | { type: 'max_tracks_per_album'; value: number }
  | { type: 'exclude_albums'; values: string[] }
  | { type: 'exclude_explicit'; value?: boolean }
  | { type: 'include_explicit_only'; value?: boolean }
  | { type: 'exclude_title_patterns'; values: string[] }
  | { type: 'exclude_version_types'; values: string[] }
  | { type: 'max_track_duration_ms'; value: number }
  | { type: 'min_track_duration_ms'; value: number }
  | { type: 'max_tracks'; value: number }
  | { type: 'min_tracks'; value: number }
  | { type: 'target_duration_ms'; value: number }
  | { type: 'max_duplicate_count'; value: number }
  | { type: 'require_unique_tracks'; value?: boolean }
  | { type: 'forbid_adjacent_same_artist'; value?: boolean };
export type RuleResult = {
  rule: PlaylistRule;
  passed: boolean;
  violations: number;
  tracks: string[];
  reason: string;
  metadata: Record<string, unknown>;
};
const names = (t: NormalizedPlaylistTrack) => t.artistNames.map((x) => x.toLocaleLowerCase());
export function evaluateRules(
  tracks: NormalizedPlaylistTrack[],
  rules: PlaylistRule[],
): RuleResult[] {
  return rules.map((rule) => {
    const involved: string[] = [];
    let violations = 0;
    const count = new Map<string, number>();
    tracks.forEach((t) => count.set(t.normalizedArtist, (count.get(t.normalizedArtist) ?? 0) + 1));
    switch (rule.type) {
      case 'min_artist_gap':
        tracks.forEach((t, i) => {
          if (
            tracks
              .slice(Math.max(0, i - rule.value), i)
              .some((x) => x.normalizedArtist === t.normalizedArtist)
          ) {
            violations++;
            if (t.uri) involved.push(t.uri);
          }
        });
        break;
      case 'max_artist_share':
        count.forEach((n, a) => {
          if (tracks.length && n / tracks.length > rule.value)
            violations += n - Math.floor(tracks.length * rule.value);
        });
        break;
      case 'max_tracks_per_artist':
        count.forEach((n) => {
          if (n > rule.value) violations += n - rule.value;
        });
        break;
      case 'exclude_artists':
        tracks.forEach((t) => {
          if (names(t).some((n) => rule.values.map((v) => v.toLocaleLowerCase()).includes(n))) {
            violations++;
            if (t.uri) involved.push(t.uri);
          }
        });
        break;
      case 'require_artists':
        violations = rule.values.filter(
          (v) => ![...count.keys()].some((a) => a === v.toLocaleLowerCase()),
        ).length;
        break;
      case 'min_album_gap':
        tracks.forEach((t, i) => {
          if (
            tracks
              .slice(Math.max(0, i - rule.value), i)
              .some((x) => x.normalizedAlbum === t.normalizedAlbum)
          )
            violations++;
        });
        break;
      case 'max_tracks_per_album':
        [...new Set(tracks.map((t) => t.normalizedAlbum))].forEach((a) => {
          const n = tracks.filter((t) => t.normalizedAlbum === a).length;
          if (n > rule.value) violations += n - rule.value;
        });
        break;
      case 'exclude_albums':
        tracks.forEach((t) => {
          if (rule.values.some((v) => t.normalizedAlbum === v.toLocaleLowerCase())) violations++;
        });
        break;
      case 'exclude_explicit':
        if (rule.value !== false) violations = tracks.filter((t) => t.explicit).length;
        break;
      case 'include_explicit_only':
        if (rule.value !== false) violations = tracks.filter((t) => !t.explicit).length;
        break;
      case 'exclude_title_patterns':
        tracks.forEach((t) => {
          if (rule.values.some((p) => t.normalizedTitle.includes(p.toLocaleLowerCase())))
            violations++;
        });
        break;
      case 'exclude_version_types':
        tracks.forEach((t) => {
          if (rule.values.some((v) => Boolean((t.version as any)[v]))) violations++;
        });
        break;
      case 'max_track_duration_ms':
        violations = tracks.filter((t) => (t.durationMs ?? 0) > rule.value).length;
        break;
      case 'min_track_duration_ms':
        violations = tracks.filter((t) => (t.durationMs ?? 0) < rule.value).length;
        break;
      case 'max_tracks':
        violations = Math.max(0, tracks.length - rule.value);
        break;
      case 'min_tracks':
        violations = Math.max(0, rule.value - tracks.length);
        break;
      case 'target_duration_ms':
        violations = Math.abs(tracks.reduce((s, t) => s + (t.durationMs ?? 0), 0) - rule.value);
        break;
      case 'max_duplicate_count':
        violations = Math.max(
          0,
          tracks.length - new Set(tracks.map((t) => t.id ?? t.uri)).size - rule.value,
        );
        break;
      case 'require_unique_tracks':
        if (rule.value !== false)
          violations = tracks.length - new Set(tracks.map((t) => t.id ?? t.uri)).size;
        break;
      case 'forbid_adjacent_same_artist':
        if (rule.value !== false)
          violations = tracks
            .slice(1)
            .filter((t, i) => t.normalizedArtist === tracks[i].normalizedArtist).length;
        break;
    }
    return {
      rule,
      passed: violations === 0,
      violations,
      tracks: involved,
      reason:
        violations === 0 ? 'Rule passed.' : `${violations} deterministic violation(s) detected.`,
      metadata: { violation_count: violations },
    };
  });
}
