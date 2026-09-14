import { randomBytes } from 'node:crypto';
import type { StoredToken } from './token-store.js';
import { SPOTIFY_SCOPES } from './scopes.js';
import { SpotifyApiError } from './errors.js';
import { toolContext } from '../mcp/context.js';
type TokenBackend = {
  load(): Promise<StoredToken | null>;
  save(token: StoredToken): Promise<void>;
  clear(): Promise<void>;
};
export class SpotifyAuth {
  private states = new Map<string, number>();
  private refreshPromise?: Promise<string>;
  constructor(
    private cfg: {
      SPOTIFY_CLIENT_ID: string;
      SPOTIFY_CLIENT_SECRET: string;
      SPOTIFY_REDIRECT_URI: string;
    },
    private store: TokenBackend,
  ) {}
  loginUrl() {
    const now = Date.now();
    for (const [value, expiresAt] of this.states) if (expiresAt <= now) this.states.delete(value);
    if (this.states.size >= 1000) {
      const oldest = this.states.keys().next().value as string | undefined;
      if (oldest) this.states.delete(oldest);
    }
    const state = randomBytes(24).toString('base64url');
    this.states.set(state, now + 600000);
    return {
      state,
      url:
        'https://accounts.spotify.com/authorize?' +
        new URLSearchParams({
          client_id: this.cfg.SPOTIFY_CLIENT_ID,
          response_type: 'code',
          redirect_uri: this.cfg.SPOTIFY_REDIRECT_URI,
          state,
          scope: SPOTIFY_SCOPES.join(' '),
        }),
    };
  }
  verifyState(state: string) {
    const exp = this.states.get(state);
    this.states.delete(state);
    if (!exp || exp < Date.now()) throw new Error('Invalid or expired OAuth state');
  }
  async callback(code: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(this.cfg.SPOTIFY_CLIENT_ID + ':' + this.cfg.SPOTIFY_CLIENT_SECRET).toString(
            'base64',
          ),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.cfg.SPOTIFY_REDIRECT_URI,
      }),
      signal: toolContext.get()?.signal
        ? AbortSignal.any([toolContext.get()!.signal, controller.signal])
        : controller.signal,
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error('Spotify authorization failed');
    const b = (await r.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    const old = await this.store.load();
    await this.store.save({
      accessToken: b.access_token,
      refreshToken: b.refresh_token ?? old?.refreshToken ?? '',
      expiresAt: Date.now() + b.expires_in * 1000,
    });
  }
  async accessToken(force = false) {
    const t = await this.store.load();
    if (!t) return null;
    if (!force && t.expiresAt > Date.now() + 60000) return t.accessToken;
    if (!this.refreshPromise)
      this.refreshPromise = this.refresh(t).finally(() => {
        this.refreshPromise = undefined;
      });
    return this.refreshPromise;
  }
  private async refresh(t: StoredToken) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(this.cfg.SPOTIFY_CLIENT_ID + ':' + this.cfg.SPOTIFY_CLIENT_SECRET).toString(
            'base64',
          ),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refreshToken }),
      signal: toolContext.get()?.signal
        ? AbortSignal.any([toolContext.get()!.signal, controller.signal])
        : controller.signal,
    });
    clearTimeout(timer);
    const b = (await r.json().catch(() => ({}))) as {
      error?: string;
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!r.ok) {
      if (b.error === 'invalid_grant') {
        await this.store.clear();
        throw new SpotifyApiError(
          401,
          'reauthorization_required',
          'Spotify authorization expired or was revoked',
          undefined,
          true,
        );
      }
      throw new Error('Spotify token refresh failed');
    }
    if (!b.access_token || !b.expires_in)
      throw new Error('Spotify token refresh response was invalid');
    await this.store.save({
      accessToken: b.access_token,
      refreshToken: b.refresh_token ?? t.refreshToken,
      expiresAt: Date.now() + b.expires_in * 1000,
    });
    return b.access_token;
  }
  async connected() {
    return Boolean(await this.store.load());
  }
}
