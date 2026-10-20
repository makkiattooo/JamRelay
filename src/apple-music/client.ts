import { McpPermissionEngine } from '../mcp/permissions.js';
import { assertQueueJobActive } from '../db/jobs.js';
import { retryAfterSeconds } from '../providers/retry-after.js';
import { ProviderApiError } from '../providers/errors.js';
import type { AppleMusicAuth } from './auth.js';
import { toolContext } from '../mcp/context.js';

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
    const parentSignal = toolContext.get()?.signal;
    const timeoutSignal = AbortSignal.timeout(15_000);
    assertQueueJobActive();
    if (init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase()))
      await McpPermissionEngine.enforceWrite(['apple-music-default']);
    else await McpPermissionEngine.enforce(undefined, ['apple-music-default']);
    const response = await fetch(`https://api.music.apple.com/v1${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as any) },
      signal: AbortSignal.any([
        timeoutSignal,
        ...(parentSignal ? [parentSignal] : []),
        ...(init.signal ? [init.signal] : []),
      ]),
    });
    const value: any = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new ProviderApiError(
        response.status,
        'Apple Music API request failed',
        'apple-music',
        'apple-music-default',
        {
          providerCode: value.errors?.[0]?.code,
          retryAfter: retryAfterSeconds(response.headers.get('retry-after')),
          scope: 'search',
        },
      );
    return value as T;
  }
  storefrontId() {
    return this.storefront;
  }
}
