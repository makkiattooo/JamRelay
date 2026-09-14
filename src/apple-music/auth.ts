import { promises as fs } from 'node:fs';
import { EncryptedCredentialStore } from '../providers/credential-store.js';
import { createAppleMusicDeveloperToken, type AppleMusicDeveloperTokenConfig } from './tokens.js';

export class AppleMusicAuth {
  private developer?: { token: string; expiresAt: number };
  constructor(
    private readonly developerConfig: AppleMusicDeveloperTokenConfig,
    private readonly privateKeyPath: string,
    private readonly store: EncryptedCredentialStore,
    private readonly connectionId = 'apple-music-default',
  ) {}
  async developerToken() {
    if (this.developer && this.developer.expiresAt > Date.now() + 60_000)
      return this.developer.token;
    const privateKey = await fs.readFile(this.privateKeyPath, 'utf8');
    const now = Math.floor(Date.now() / 1000);
    const token = createAppleMusicDeveloperToken({ ...this.developerConfig, privateKey }, now);
    this.developer = { token, expiresAt: (now + 86400) * 1000 };
    return token;
  }
  async musicUserToken() {
    const value = await this.store.load<{ musicUserToken?: string }>(this.connectionId);
    return value?.musicUserToken ?? null;
  }
  async setMusicUserToken(token: string) {
    if (!/^[!-~]+$/.test(token)) throw new Error('apple_music_user_token_invalid');
    await this.store.save(
      this.connectionId,
      { musicUserToken: token },
      { provider: 'apple-music', userToken: true },
    );
  }
  connected() {
    return this.musicUserToken().then(Boolean);
  }
}
