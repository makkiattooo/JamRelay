import { createSign } from 'node:crypto';

const base64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');
export type AppleMusicDeveloperTokenConfig = { teamId: string; keyId: string; privateKey: string };

/** Creates the short-lived ES256 JWT Apple uses as a developer token. */
export function createAppleMusicDeveloperToken(
  config: AppleMusicDeveloperTokenConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!config.teamId || !config.keyId || !config.privateKey)
    throw new Error('apple_music_credentials_incomplete');
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId, typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ iss: config.teamId, iat: nowSeconds, exp: nowSeconds + 86400 }),
  );
  const input = `${header}.${payload}`;
  const signature = createSign('SHA256')
    .update(input)
    .end()
    .sign({ key: config.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${input}.${base64url(signature)}`;
}
