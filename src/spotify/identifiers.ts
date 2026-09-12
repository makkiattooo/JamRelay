export type Entity = 'track' | 'artist' | 'album' | 'playlist' | 'episode';
export function parseSpotifyIdentifier(
  value: string,
  expected?: Entity,
): { id: string; uri: string; type: Entity } {
  const s = value.trim();
  let type: Entity | undefined, id: string | undefined;
  const uri = s.match(/^spotify:(track|artist|album|playlist|episode):([A-Za-z0-9]+)$/);
  const url = s.match(/open\.spotify\.com\/(track|artist|album|playlist|episode)\/([A-Za-z0-9]+)/);
  if (uri) {
    type = uri[1] as Entity;
    id = uri[2];
  } else if (url) {
    type = url[1] as Entity;
    id = url[2];
  } else if (/^[A-Za-z0-9]+$/.test(s) && expected) {
    type = expected;
    id = s;
  } else throw new Error('Invalid Spotify identifier');
  if (expected && type !== expected) throw new Error(`Expected ${expected}, got ${type}`);
  return { id: id!, type: type!, uri: `spotify:${type}:${id}` };
}
