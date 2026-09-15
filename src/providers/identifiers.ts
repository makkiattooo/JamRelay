export type ProviderEntity = 'track' | 'artist' | 'album' | 'playlist' | 'episode';

/** Provider-neutral identifier parser; provider-specific URL rules stay in adapters. */
export function parseProviderIdentifier(
  value: string,
  provider: string,
  expected?: ProviderEntity,
): { id: string; uri: string; type: ProviderEntity } {
  const input = value.trim();
  let type: ProviderEntity | undefined;
  let id: string | undefined;
  const uri = input.match(
    new RegExp(`^${provider}:(track|artist|album|playlist|episode):([A-Za-z0-9]+)$`),
  );
  const url = input.match(
    new RegExp(`/${'(track|artist|album|playlist|episode)'}/([A-Za-z0-9]+)(?:$|[?#])`),
  );
  if (uri) {
    type = uri[1] as ProviderEntity;
    id = uri[2];
  } else if (url) {
    type = url[1] as ProviderEntity;
    id = url[2];
  } else if (/^[A-Za-z0-9]+$/.test(input) && expected) {
    type = expected;
    id = input;
  } else {
    throw new Error(`Invalid ${provider} identifier`);
  }
  if (expected && type !== expected) throw new Error(`Expected ${expected}, got ${type}`);
  return { id: id!, type: type!, uri: `${provider}:${type}:${id}` };
}
