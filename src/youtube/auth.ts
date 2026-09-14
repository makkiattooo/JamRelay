import { createHash, randomBytes } from 'node:crypto';
import { EncryptedCredentialStore } from '../providers/credential-store.js';
import { ProviderApiError } from '../providers/errors.js';

export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
export type YouTubeToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
};
export class YouTubeAuth {
  private states = new Map<string, { verifier: string; expiresAt: number }>();
  constructor(
    private readonly cfg: { clientId: string; clientSecret: string; redirectUri: string },
    private readonly store: EncryptedCredentialStore,
    private readonly connectionId = 'youtube-default',
  ) {}
  loginUrl() {
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    this.states.set(state, { verifier, expiresAt: Date.now() + 600000 });
    return {
      state,
      url:
        'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
          client_id: this.cfg.clientId,
          redirect_uri: this.cfg.redirectUri,
          response_type: 'code',
          scope: YOUTUBE_SCOPE,
          access_type: 'offline',
          prompt: 'consent',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state,
        }).toString(),
    };
  }
  verifyState(state: string) {
    const value = this.states.get(state);
    this.states.delete(state);
    if (!value || value.expiresAt <= Date.now())
      throw new Error('Invalid or expired YouTube OAuth state');
    return value.verifier;
  }
  async callback(code: string, verifier: string) {
    const response = await this.tokenRequest(
      new URLSearchParams({
        code,
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        redirect_uri: this.cfg.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    );
    await this.save(response, await this.store.load<YouTubeToken>(this.connectionId));
  }
  async accessToken() {
    const token = await this.store.load<YouTubeToken>(this.connectionId);
    if (!token) return null;
    if (token.expiresAt > Date.now() + 60000) return token.accessToken;
    if (!token.refreshToken)
      throw new ProviderApiError(
        401,
        'YouTube reauthorization required',
        'youtube',
        this.connectionId,
      );
    const response = await this.tokenRequest(
      new URLSearchParams({
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        refresh_token: token.refreshToken,
        grant_type: 'refresh_token',
      }),
    );
    await this.save(response, token);
    return response.access_token;
  }
  connected() {
    return this.store.load<YouTubeToken>(this.connectionId).then(Boolean);
  }
  private async save(value: any, previous: YouTubeToken | null) {
    await this.store.save(
      this.connectionId,
      {
        accessToken: value.access_token,
        refreshToken: value.refresh_token ?? previous?.refreshToken,
        expiresAt: Date.now() + Number(value.expires_in ?? 3600) * 1000,
        scope: value.scope ?? previous?.scope,
      },
      { provider: 'youtube', scope: value.scope ?? previous?.scope ?? null },
    );
  }
  private async tokenRequest(body: URLSearchParams) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const value: any = await response.json().catch(() => ({}));
    if (!response.ok || !value.access_token)
      throw new ProviderApiError(
        response.status,
        'YouTube OAuth token exchange failed',
        'youtube',
        this.connectionId,
        { providerCode: value.error },
      );
    return value;
  }
}
