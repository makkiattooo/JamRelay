import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type CredentialMetadata = Record<string, boolean | number | string | null>;

export type CredentialRecord = {
  connectionId: string;
  metadata: CredentialMetadata;
  createdAt: number;
  updatedAt: number;
};

export type OAuthCredential = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

/** Binds one provider OAuth session to the generic encrypted store. */
export class ConnectionCredentialStore {
  constructor(
    private readonly store: EncryptedCredentialStore,
    private readonly connectionId: string,
  ) {}

  load() {
    return this.store.load<OAuthCredential>(this.connectionId);
  }

  save(value: OAuthCredential) {
    return this.store.save(this.connectionId, value);
  }

  clear() {
    return this.store.remove(this.connectionId).then(() => undefined);
  }
}

type EncryptedRecord = CredentialRecord & {
  iv: string;
  tag: string;
  data: string;
};

type StoreFile = {
  version: 1;
  records: Record<string, EncryptedRecord>;
};

const emptyStore = (): StoreFile => ({ version: 1, records: {} });

export class EncryptedCredentialStore {
  private readonly key: Buffer;

  constructor(
    private readonly path: string,
    raw = process.env.TOKEN_ENCRYPTION_KEY,
  ) {
    if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY is required');
    this.key = Buffer.from(raw, 'base64');
    if (this.key.length !== 32)
      throw new Error('TOKEN_ENCRYPTION_KEY must be base64 encoded 32 bytes');
  }

  async list(): Promise<CredentialRecord[]> {
    const store = await this.readStore();
    return Object.values(store.records).map(({ iv, tag, data, ...record }) => ({ ...record }));
  }

  async has(connectionId: string): Promise<boolean> {
    const store = await this.readStore();
    return Boolean(store.records[connectionId]);
  }

  async load<T = unknown>(connectionId: string): Promise<T | null> {
    const store = await this.readStore();
    const record = store.records[connectionId];
    if (!record) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(record.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
      return JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(record.data, 'base64')),
          decipher.final(),
        ]).toString('utf8'),
      ) as T;
    } catch {
      throw new Error('Provider credential store is corrupt or cannot be decrypted');
    }
  }

  async save(connectionId: string, credentials: unknown, metadata: CredentialMetadata = {}) {
    if (!connectionId) throw new Error('connectionId is required');
    const store = await this.readStore();
    const previous = store.records[connectionId];
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(credentials)), cipher.final()]);
    const now = Date.now();
    store.records[connectionId] = {
      connectionId,
      metadata: { ...metadata },
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
    await this.writeStore(store);
  }

  async remove(connectionId: string): Promise<boolean> {
    const store = await this.readStore();
    if (!store.records[connectionId]) return false;
    delete store.records[connectionId];
    await this.writeStore(store);
    return true;
  }

  private async readStore(): Promise<StoreFile> {
    let raw: string;
    try {
      raw = await fs.readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
      throw new Error('Provider credential store is corrupt or cannot be read');
    }
    try {
      const value = JSON.parse(raw) as StoreFile;
      if (value.version !== 1 || !value.records || typeof value.records !== 'object')
        throw new Error();
      return value;
    } catch {
      throw new Error('Provider credential store is corrupt or cannot be read');
    }
  }

  private async writeStore(store: StoreFile): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp-${randomBytes(6).toString('hex')}`;
    const handle = await fs.open(tmp, 'w', 0o600);
    try {
      await handle.writeFile(JSON.stringify(store));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.rename(tmp, this.path);
      await fs.chmod(this.path, 0o600);
    } catch (error) {
      await fs.unlink(tmp).catch(() => undefined);
      throw error;
    }
  }
}

export async function migrateLegacyCredentialStore(
  legacyStore: { load(): Promise<unknown> },
  genericStore: EncryptedCredentialStore,
  connectionId: string,
  metadata: CredentialMetadata = {},
): Promise<'imported' | 'skipped' | 'missing'> {
  if (await genericStore.has(connectionId)) return 'skipped';
  const credentials = await legacyStore.load();
  if (credentials === null) return 'missing';
  await genericStore.save(connectionId, credentials, metadata);
  return 'imported';
}
