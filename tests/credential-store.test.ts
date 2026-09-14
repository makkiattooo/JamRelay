import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  EncryptedCredentialStore,
  migrateLegacyCredentialStore,
} from '../src/providers/credential-store.js';

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

async function setup() {
  root = await mkdtemp(join(tmpdir(), 'jamrelay-credentials-'));
  return {
    path: join(root, 'nested', 'provider-credentials.json'),
    key: randomBytes(32).toString('base64'),
  };
}

describe('encrypted provider credential store', () => {
  it('keeps multiple connection records encrypted and preserves metadata', async () => {
    const { path, key } = await setup();
    const store = new EncryptedCredentialStore(path, key);
    await store.save(
      'alpha-main',
      { accessToken: 'alpha-access', refreshToken: 'alpha-refresh' },
      { provider: 'alpha' },
    );
    await store.save(
      'beta-main',
      { accessToken: 'beta-access', refreshToken: 'beta-refresh' },
      { provider: 'beta' },
    );
    expect(await store.load('alpha-main')).toEqual({
      accessToken: 'alpha-access',
      refreshToken: 'alpha-refresh',
    });
    expect((await store.list()).map((x) => x.connectionId)).toEqual(['alpha-main', 'beta-main']);
    const raw = await readFile(path, 'utf8');
    expect(raw).not.toContain('alpha-access');
    expect(raw).not.toContain('beta-refresh');
  });

  it('rejects corruption and a wrong encryption key without exposing credentials', async () => {
    const { path, key } = await setup();
    const store = new EncryptedCredentialStore(path, key);
    await store.save('main', { refreshToken: 'secret-refresh' });
    await expect(
      new EncryptedCredentialStore(path, randomBytes(32).toString('base64')).load('main'),
    ).rejects.toThrow('corrupt or cannot be decrypted');
    await rm(path);
    await (await import('node:fs/promises')).writeFile(path, '{broken');
    await expect(store.list()).rejects.toThrow('corrupt or cannot be read');
    try {
      await store.list();
    } catch (error) {
      expect(String(error)).not.toContain('secret-refresh');
    }
  });

  it('writes atomically with restrictive permissions and keeps the old record on a failed save', async () => {
    const { path, key } = await setup();
    const store = new EncryptedCredentialStore(path, key);
    await store.save('main', { accessToken: 'first' });
    if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600);
    await expect(store.save('main', BigInt(1))).rejects.toThrow();
    expect(await store.load('main')).toEqual({ accessToken: 'first' });
  });

  it('imports legacy credentials only when explicitly requested and never deletes the legacy source', async () => {
    const { path, key } = await setup();
    const store = new EncryptedCredentialStore(path, key);
    const legacy = {
      load: async () => ({ accessToken: 'legacy-access', refreshToken: 'legacy-refresh' }),
    };
    expect(
      await migrateLegacyCredentialStore(legacy, store, 'spotify-main', { provider: 'spotify' }),
    ).toBe('imported');
    expect(await migrateLegacyCredentialStore(legacy, store, 'spotify-main')).toBe('skipped');
    expect(await store.load('spotify-main')).toEqual(legacy && (await legacy.load()));
  });
});
