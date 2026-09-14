-- JamRelay migration: canonical_listening_history
-- Complete the provider-aware listening backfill after all provider mappings exist.
-- Legacy Spotify columns remain populated and readable for compatibility.

UPDATE listening_events
SET provider_id = COALESCE(provider_id, 'spotify'),
    connection_id = COALESCE(connection_id, 'spotify-default'),
    provider_track_id = COALESCE(provider_track_id, spotify_track_id),
    provider_uri = COALESCE(provider_uri, track_uri)
WHERE provider_id IS NULL OR connection_id IS NULL OR provider_track_id IS NULL OR provider_uri IS NULL;

UPDATE listening_events
SET canonical_track_id = (SELECT m.track_id FROM track_provider_mappings m
  WHERE m.provider_id = listening_events.provider_id AND m.connection_id = listening_events.connection_id
    AND m.provider_track_id = listening_events.provider_track_id LIMIT 1)
WHERE canonical_track_id IS NULL;

UPDATE listening_events
SET canonical_track_id = (SELECT t.id FROM tracks t
  WHERE t.spotify_track_id = listening_events.spotify_track_id LIMIT 1)
WHERE canonical_track_id IS NULL AND provider_id = 'spotify';

CREATE INDEX IF NOT EXISTS idx_listening_events_provider_track
  ON listening_events(provider_id, connection_id, provider_track_id, occurred_at DESC);
