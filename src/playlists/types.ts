export type NormalizedPlaylistTrack = {
  id: string | null;
  canonicalTrackId?: number | null;
  providerId?: string | null;
  connectionId?: string | null;
  uri: string | null;
  title: string;
  normalizedTitle: string;
  artistIds: string[];
  artistNames: string[];
  primaryArtist: string;
  normalizedArtist: string;
  albumId: string | null;
  albumName: string;
  normalizedAlbum: string;
  durationMs: number | null;
  explicit: boolean;
  isrc: string | null;
  position: number;
  originalIndex: number;
  version: {
    remaster: boolean;
    live: boolean;
    remix: boolean;
    radioEdit: boolean;
    acoustic: boolean;
    instrumental: boolean;
    spedUp: boolean;
    slowed: boolean;
  };
};

export type DuplicateGroup = {
  key: string;
  kept: NormalizedPlaylistTrack;
  removable: NormalizedPlaylistTrack[];
  confidence: 'exact' | 'high' | 'review';
  reason: string;
  evidence: string[];
};

export type OperationPlan = {
  id: string;
  playlistId: string;
  createdAt: number;
  operation: string;
  originalTrackCount: number;
  expectedTrackCount: number;
  additions: Array<{ uri: string; position?: number }>;
  removals: Array<{ uri: string; position: number; reason?: string }>;
  moves: Array<{ from: number; to: number; uri: string }>;
  replacements: Array<{ from: string; to: string; reason: string }>;
  warnings: string[];
  metrics: Record<string, unknown>;
  estimatedApiCalls: number;
  destructive: boolean;
  beforeFingerprint: string;
  expectedAfterFingerprint: string;
};
