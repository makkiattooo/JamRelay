import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppleMusicDeveloperToken } from '../src/apple-music/tokens.js';
import { AppleMusicAuth } from '../src/apple-music/auth.js';
import { AppleMusicProviderAdapter } from '../src/apple-music/provider-adapter.js';
import { EncryptedCredentialStore } from '../src/providers/credential-store.js';

let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});

describe('Apple Music provider', () => {
  it('creates an ES256 developer token with bounded expiry using a fixture key', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const token = createAppleMusicDeveloperToken(
      {
        teamId: 'TEAM',
        keyId: 'KEY',
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
      1000,
    );
    const [header, payload, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toMatchObject({
      alg: 'ES256',
      kid: 'KEY',
    });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iss: 'TEAM',
      iat: 1000,
      exp: 87400,
    });
    expect(signature).toHaveLength(86);
  });

  it('encrypts the Music User Token and uses the shared provider surface', async () => {
    root = await mkdtemp(join(tmpdir(), 'jamrelay-apple-music-'));
    const store = new EncryptedCredentialStore(
      join(root, 'credentials.json'),
      Buffer.alloc(32, 7).toString('base64'),
    );
    const auth = { musicUserToken: async () => 'user-token' } as any;
    const responses: any[] = [];
    const client = {
      storefrontId: () => 'us',
      request: async (path: string, init?: any, user?: boolean) => {
        responses.push({ path, init, user });
        return path.includes('/search')
          ? {
              results: {
                songs: {
                  data: [{ id: 'song-1', attributes: { name: 'Song', artistName: 'Artist' } }],
                },
              },
            }
          : { data: [] };
      },
    } as any;
    const adapter = new AppleMusicProviderAdapter(auth, {}, client);
    await adapter.refreshCapabilities();
    expect(adapter.summary.capabilities).toMatchObject({
      catalog: true,
      playlistRead: true,
      playlistWrite: true,
    });
    expect(await adapter.catalog.searchTracks('song')).toHaveLength(1);
    expect(responses[0]).toMatchObject({
      path: '/catalog/us/search?term=song&types=songs&limit=20',
    });
    expect(responses[0].user).toBeUndefined();
    const realAuth = new AppleMusicAuth(
      { teamId: 'T', keyId: 'K', privateKey: '' },
      'unused',
      store,
    );
    await realAuth.setMusicUserToken('secret-user-token');
    expect(await realAuth.musicUserToken()).toBe('secret-user-token');
    const raw = await (
      await import('node:fs/promises')
    ).readFile(join(root, 'credentials.json'), 'utf8');
    expect(raw).not.toContain('secret-user-token');
  });
});
