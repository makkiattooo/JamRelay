import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Node/OpenSSL scrypt: memory-hard password hashing, 128 MiB per verification.
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 32, options, (error, key) => (error ? reject(error) : resolve(key))),
  );
export function validPasswordHash(hash: string) {
  return /^scrypt\$131072\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(hash);
}
export function passwordProblem(password: string) {
  if (password.length < 12 || password.length > 256)
    return 'Use 12–256 characters, preferably a unique passphrase.';
  if (new Set(password.toLowerCase()).size < 6)
    return 'Use a less repetitive password or a unique passphrase.';
  return undefined;
}
export async function hashOwnerPassword(password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const salt = randomBytes(16);
  return `scrypt$131072$8$1$${salt.toString('base64url')}$${(await derive(password, salt)).toString('base64url')}`;
}
let verifications = 0;
export async function verifyOwnerPassword(password: string, hash?: string) {
  if (!hash || !validPasswordHash(hash) || password.length > 256) return false;
  const fields = hash.split('$');
  if (verifications >= 2) return false;
  verifications++;
  try {
    return timingSafeEqual(
      await derive(password, Buffer.from(fields[4], 'base64url')),
      Buffer.from(fields[5], 'base64url'),
    );
  } finally {
    verifications--;
  }
}
export async function ownerCredentialMatches(
  body: { owner_password?: unknown; owner_secret?: unknown },
  secret: string,
  hash?: string,
) {
  // The method is explicit; never fall back from a failed password to a recovery secret.
  if (typeof body.owner_password === 'string' && body.owner_password)
    return verifyOwnerPassword(body.owner_password, hash);
  const { createHash } = await import('node:crypto');
  const supplied = typeof body.owner_secret === 'string' ? body.owner_secret : '';
  return (
    Boolean(secret) &&
    timingSafeEqual(
      createHash('sha256').update(supplied).digest(),
      createHash('sha256').update(secret).digest(),
    )
  );
}
export function ownerCredentialFields(hasPassword: boolean) {
  const recovery =
    '<label>Recovery / legacy owner secret <input type="password" name="owner_secret" autocomplete="off" maxlength="1024"></label>';
  return hasPassword
    ? '<label>Owner password <input type="password" name="owner_password" autocomplete="current-password" maxlength="256"></label><details><summary>Use recovery / legacy secret instead</summary><p>Leave the password blank when using recovery.</p>' +
        recovery +
        '</details>'
    : recovery +
        '<p>Set an owner password with <code>jamrelay owner password</code> on the server.</p>';
}
