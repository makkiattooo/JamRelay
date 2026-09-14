import { createHash, randomBytes } from 'node:crypto';
import { EncryptedCredentialStore } from '../providers/credential-store.js';
import { ProviderApiError } from '../providers/errors.js';
import { toolContext } from '../mcp/context.js';

export type SoundCloudToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
};
export class SoundCloudAuth {
  private readonly states = new Map<string, { verifier: string; expiresAt: number }>();
  private refreshPromise?: Promise<string>;
  constructor(
    private readonly cfg: {
      SOUNDCLOUD_CLIENT_ID: string;
      SOUNDCLOUD_CLIENT_SECRET: string;
      SOUNDCLOUD_REDIRECT_URI: string;
    },
    private readonly store: EncryptedCredentialStore,
    private readonly connectionId = 'soundcloud-default',
  ) {}
  loginUrl() {
    const now = Date.now();
    for (const [state, value] of this.states) if (value.expiresAt <= now) this.states.delete(state);
    while (this.states.size >= 1000) this.states.delete(this.states.keys().next().value!);
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    this.states.set(state, { verifier, expiresAt: now + 600000 });
    return {
      state,
      url:
        'https://secure.soundcloud.com/authorize?' +
        new URLSearchParams({
          client_id: this.cfg.SOUNDCLOUD_CLIENT_ID,
          redirect_uri: this.cfg.SOUNDCLOUD_REDIRECT_URI,
          response_type: 'code',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state,
        }),
    };
  }
  verifyState(state: string) {
    const value = this.states.get(state);
    this.states.delete(state);
    if (!value || value.expiresAt <= Date.now())
      throw new Error('Invalid or expired SoundCloud OAuth state');
    return value.verifier;
  }
  async callback(code: string, verifier: string) {
    const response = await this.tokenRequest(
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.cfg.SOUNDCLOUD_CLIENT_ID,
        client_secret: this.cfg.SOUNDCLOUD_CLIENT_SECRET,
        redirect_uri: this.cfg.SOUNDCLOUD_REDIRECT_URI,
        code,
        code_verifier: verifier,
      }),
    );
    await this.saveToken(response);
  }
  async accessToken(force = false) {
    const token = await this.store.load<SoundCloudToken>(this.connectionId);
    if (!token) return null;
    if (!force && token.expiresAt > Date.now() + 60000) return token.accessToken;
    if (!this.refreshPromise)
      this.refreshPromise = this.refresh(token).finally(() => {
        this.refreshPromise = undefined;
      });
    return this.refreshPromise;
  }
  async connected() {
    return Boolean(await this.store.load(this.connectionId));
  }
  private async refresh(token: SoundCloudToken) {
    try {
      const result = await this.tokenRequest(
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.cfg.SOUNDCLOUD_CLIENT_ID,
          client_secret: this.cfg.SOUNDCLOUD_CLIENT_SECRET,
          refresh_token: token.refreshToken,
        }),
      );
      await this.saveToken(result);
      return result.access_token;
    } catch (error) {
      if (error instanceof ProviderApiError && error.status === 400)
        await this.store.remove(this.connectionId);
      throw error;
    }
  }
  private async tokenRequest(body: URLSearchParams) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('https://secure.soundcloud.com/oauth/token', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: toolContext.get()?.signal
          ? AbortSignal.any([toolContext.get()!.signal, controller.signal])
          : controller.signal,
      });
      const value: any = await response.json().catch(() => ({}));
      if (!response.ok || !value.access_token || !value.refresh_token)
        throw new ProviderApiError(
          response.status,
          'SoundCloud token exchange failed',
          'soundcloud',
          this.connectionId,
          { providerCode: value.error },
        );
      return value;
    } finally {
      clearTimeout(timer);
    }
  }
  private saveToken(value: any) {
    return this.store.save(this.connectionId, {
      accessToken: value.access_token,
      refreshToken: value.refresh_token,
      expiresAt: Date.now() + Number(value.expires_in ?? 3600) * 1000,
      scope: value.scope,
    });
  }
}
