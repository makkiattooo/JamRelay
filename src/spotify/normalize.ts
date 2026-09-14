export {
  normalizeText,
  normalizeTitle,
  resolveCandidates,
  scoreTrack,
  type MusicAlbum,
  type MusicArtist,
  type MusicCandidate,
} from '../music/normalize.js';

import type { MusicCandidate } from '../music/normalize.js';

/** Spotify compatibility shape; generic matching itself lives in src/music. */
export type TrackCandidate = MusicCandidate & {
  uri: string;
  duration_ms?: number;
  external_url?: string;
};
