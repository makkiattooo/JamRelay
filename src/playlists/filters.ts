import type { NormalizedPlaylistTrack } from './types.js';
export type PlaylistFilter = {
  type:
    | 'artist'
    | 'album'
    | 'explicit'
    | 'title_contains'
    | 'title_regex'
    | 'duration_range'
    | 'version_type'
    | 'track_ids'
    | 'album_ids'
    | 'artist_ids';
  value?: string | boolean | number;
  values?: string[];
  min?: number;
  max?: number;
};
export function filterTracks(
  tracks: NormalizedPlaylistTrack[],
  filters: PlaylistFilter[],
  mode: 'keep_matching' | 'remove_matching',
) {
  const matching = tracks.filter((t) =>
    filters.every((f) => {
      switch (f.type) {
        case 'artist':
          return t.artistNames.some(
            (x) => x.toLocaleLowerCase() === String(f.value).toLocaleLowerCase(),
          );
        case 'album':
          return t.normalizedAlbum === String(f.value).toLocaleLowerCase();
        case 'explicit':
          return t.explicit === f.value;
        case 'title_contains':
          return t.normalizedTitle.includes(String(f.value).toLocaleLowerCase());
        case 'title_regex':
          return String(f.value).length <= 100 && new RegExp(String(f.value), 'i').test(t.title);
        case 'duration_range':
          return (
            (t.durationMs ?? 0) >= (f.min ?? 0) && (t.durationMs ?? Infinity) <= (f.max ?? Infinity)
          );
        case 'version_type':
          return Boolean((t.version as any)[String(f.value)]);
        case 'track_ids':
          return (f.values ?? []).includes(t.id ?? '');
        case 'album_ids':
          return (f.values ?? []).includes(t.albumId ?? '');
        case 'artist_ids':
          return t.artistIds.some((x) => (f.values ?? []).includes(x));
      }
    }),
  );
  const set = new Set(matching.map((t) => t.uri));
  return {
    matching,
    result: tracks.filter((t) => (mode === 'keep_matching' ? set.has(t.uri) : !set.has(t.uri))),
  };
}
