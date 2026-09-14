import type { MusicCandidate } from '../music/normalize.js';

export interface IdentityCapability {
  getCurrentUser(): Promise<unknown>;
}

export interface CatalogCapability {
  searchTracks(query: string, options?: Record<string, unknown>): Promise<MusicCandidate[]>;
  searchArtists?(query: string, options?: Record<string, unknown>): Promise<unknown[]>;
  searchAlbums?(query: string, options?: Record<string, unknown>): Promise<unknown[]>;
  getTrack(id: string): Promise<MusicCandidate | null>;
  getArtist?(id: string): Promise<unknown | null>;
  getTopTracks?(options?: Record<string, unknown>): Promise<unknown>;
  getTopArtists?(options?: Record<string, unknown>): Promise<unknown>;
}

export interface PlaylistReadCapability {
  listPlaylists(options?: Record<string, unknown>): Promise<unknown>;
  getPlaylist(id: string, options?: Record<string, unknown>): Promise<unknown>;
  getPlaylistTracks(id: string, options?: Record<string, unknown>): Promise<unknown>;
}

export interface PlaylistWriteCapability {
  createPlaylist(input: unknown): Promise<unknown>;
  addTracks(playlistId: string, trackIds: string[]): Promise<unknown>;
  removeTracks(
    playlistId: string,
    trackIds: string[],
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  reorderTracks(playlistId: string, input: unknown): Promise<unknown>;
  replaceTracks(playlistId: string, trackIds: string[]): Promise<unknown>;
  updatePlaylist(playlistId: string, input: unknown): Promise<unknown>;
}

export interface LibraryCapability {
  listSavedTracks(options?: Record<string, unknown>): Promise<unknown>;
  checkSavedTracks?(trackIds: string[]): Promise<unknown>;
  saveTracks(trackIds: string[]): Promise<unknown>;
  removeTracks(trackIds: string[]): Promise<unknown>;
}

export interface PlaybackCapability {
  getPlaybackState(): Promise<unknown>;
  getCurrentlyPlaying?(): Promise<unknown>;
  controlPlayback(action: string, input?: unknown): Promise<unknown>;
}

export interface HistoryCapability {
  getRecentlyPlayed(options?: Record<string, unknown>): Promise<unknown>;
}

export interface ProviderCapabilities {
  identity?: boolean;
  catalog?: boolean;
  playlistRead?: boolean;
  playlistWrite?: boolean;
  library?: boolean;
  playback?: boolean;
  history?: boolean;
}

export type ProviderCapabilityName = keyof ProviderCapabilities;

export type ProviderCapabilityImplementations = {
  identity?: IdentityCapability;
  catalog?: CatalogCapability;
  playlistRead?: PlaylistReadCapability;
  playlistWrite?: PlaylistWriteCapability;
  library?: LibraryCapability;
  playback?: PlaybackCapability;
  history?: HistoryCapability;
};
