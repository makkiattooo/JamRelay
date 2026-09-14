import { ProviderApiError } from '../providers/errors.js';
import type { SoundCloudAuth } from './auth.js';
export class SoundCloudClient {
  constructor(
    private readonly auth: SoundCloudAuth,
    private readonly connectionId = 'soundcloud-default',
  ) {}
  async request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.auth.accessToken();
    if (!token)
      throw new ProviderApiError(
        401,
        'SoundCloud connection is not authenticated',
        'soundcloud',
        this.connectionId,
      );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('https://api.soundcloud.com' + path, {
        ...init,
        headers: { accept: 'application/json', Authorization: 'OAuth ' + token, ...init.headers },
        signal: AbortSignal.any([controller.signal, ...(init.signal ? [init.signal] : [])]),
      });
      const value: any = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new ProviderApiError(
          response.status,
          'SoundCloud API request failed',
          'soundcloud',
          this.connectionId,
          { providerCode: value.error, capability: 'provider_api' },
        );
      return value as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
