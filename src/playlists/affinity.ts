import type { NormalizedPlaylistTrack } from './types.js';
import { historyStats } from './history.js';
export function rankTracks(
  tracks: NormalizedPlaylistTrack[],
  mode: 'affinity' | 'freshness' | 'rediscovery' | 'recent_frequency' = 'affinity',
) {
  const stats = historyStats(tracks.flatMap((t) => (t.id ? [t.id] : []))),
    now = Date.now();
  return tracks
    .map((track) => {
      const s = track.id ? stats.get(track.id) : undefined,
        plays = Number(s?.plays ?? 0),
        last = Number(s?.lastPlayed ?? 0),
        recency = last ? Math.exp(-(now - last) / (1000 * 60 * 60 * 24 * 45)) : 1;
      const components = {
        saved_track: 0,
        observed_plays: Math.min(0.35, plays * 0.07),
        freshness: recency,
        rediscovery: plays ? Math.max(0, 1 - recency) : 0.8,
        recent_frequency: Math.min(1, plays / 10),
      };
      const score =
        mode === 'freshness'
          ? components.freshness
          : mode === 'rediscovery'
            ? components.rediscovery
            : mode === 'recent_frequency'
              ? components.recent_frequency
              : 0.35 + components.observed_plays * 0.5 + components.rediscovery * 0.15;
      return {
        track,
        score,
        components,
        evidence: plays
          ? [
              `${plays} locally observed play(s)`,
              last ? `last observed ${new Date(last).toISOString()}` : '',
            ]
          : ['no local playback evidence'],
      };
    })
    .sort((a, b) => b.score - a.score || a.track.position - b.track.position);
}
