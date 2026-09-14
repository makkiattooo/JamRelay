import { ProviderApiError } from '../providers/errors.js';
import type { AppleMusicAuth } from './auth.js';

export class AppleMusicClient {
  constructor(
    private readonly auth: AppleMusicAuth,
    private readonly storefront = 'us',
  ) {}
  async request<T = any>(path: string, init: RequestInit = {}, user = false): Promise<T> {
    const developerToken = await this.auth.developerToken();
    const headers: Record<string, string> = {
      accept: 'application/json',
      Authorization: `Bearer ${developerToken}`,
    };
    if (user) {
      const userToken = await this.auth.musicUserToken();
      if (!userToken)
        throw new ProviderApiError(
          403,
          'Apple Music User Token is required',
          'apple-music',
          'apple-music-default',
        );
      headers['Music-User-Token'] = userToken;
    }
    const response = await fetch(`https://api.music.apple.com/v1${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as any) },
    });
    const value: any = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new ProviderApiError(
        response.status,
        'Apple Music API request failed',
        'apple-music',
        'apple-music-default',
        { providerCode: value.errors?.[0]?.code },
      );
    return value as T;
  }
  storefrontId() {
    return this.storefront;
  }
}
