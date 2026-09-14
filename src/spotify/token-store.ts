import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import {
  EncryptedCredentialStore,
  migrateLegacyCredentialStore,
} from '../providers/credential-store.js';
export type StoredToken = { accessToken: string; refreshToken: string; expiresAt: number };
export class TokenStore {
  private key: Buffer;
  constructor(
    private path = '/data/spotify-token.json',
    raw = process.env.TOKEN_ENCRYPTION_KEY,
  ) {
    if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY is required');
    this.key = Buffer.from(raw, 'base64');
    if (this.key.length !== 32)
      throw new Error('TOKEN_ENCRYPTION_KEY must be base64 encoded 32 bytes');
  }
  async load() {
    try {
      const x = JSON.parse(await fs.readFile(this.path, 'utf8')) as {
        iv: string;
        tag: string;
        data: string;
      };
      const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(x.iv, 'base64'));
      d.setAuthTag(Buffer.from(x.tag, 'base64'));
      return JSON.parse(
        Buffer.concat([d.update(Buffer.from(x.data, 'base64')), d.final()]).toString(),
      ) as StoredToken;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error('Token store is corrupt or cannot be decrypted');
    }
  }
  async save(token: StoredToken) {
    const iv = randomBytes(12),
      c = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([c.update(JSON.stringify(token)), c.final()]);
    const payload = JSON.stringify({
      iv: iv.toString('base64'),
      tag: c.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    });
    await fs.mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp-${randomBytes(6).toString('hex')}`;
    const h = await fs.open(tmp, 'w', 0o600);
    await h.writeFile(payload);
    await h.sync();
    await h.close();
    await fs.rename(tmp, this.path);
  }
  async clear() {
    try {
      await fs.unlink(this.path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
}

/** Explicit compatibility migration; it never deletes the legacy token file. */
export function migrateLegacySpotifyTokenStore(
  legacyStore: TokenStore,
  genericStore: EncryptedCredentialStore,
  connectionId = 'spotify-default',
) {
  return migrateLegacyCredentialStore(legacyStore, genericStore, connectionId, {
    provider: 'spotify',
  });
}
