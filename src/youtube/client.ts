import { ProviderApiError } from '../providers/errors.js';
import type { YouTubeAuth } from './auth.js';
import { toolContext } from '../mcp/context.js';
export const YOUTUBE_QUOTA_COST: Record<string, number> = {
  'playlists.list': 1,
  'playlists.insert': 50,
  'playlists.update': 50,
  'playlists.delete': 50,
  'playlistItems.list': 1,
  'playlistItems.insert': 50,
  'playlistItems.update': 50,
  'playlistItems.delete': 50,
  'search.list': 1,
  'videos.list': 1,
};
export class YouTubeClient {
  constructor(private readonly auth: YouTubeAuth) {}
  async request<T = any>(
    method: string,
    params: Record<string, string | number | boolean | undefined> = {},
    body?: unknown,
  ): Promise<{ value: T; quotaCost: number }> {
    const token = await this.auth.accessToken();
    if (!token)
      throw new ProviderApiError(
        401,
        'YouTube connection is not authenticated',
        'youtube',
        'youtube-default',
      );
    const url = new URL('https://www.googleapis.com/youtube/v3/' + method);
    Object.entries(params).forEach(
      ([k, v]) => v !== undefined && url.searchParams.set(k, String(v)),
    );
    const httpMethod = method.endsWith('.update')
      ? 'PUT'
      : method.endsWith('.delete')
        ? 'DELETE'
        : body === undefined
          ? 'GET'
          : 'POST';
    const timeoutSignal = AbortSignal.timeout(15_000);
    const parentSignal = toolContext.get()?.signal;
    const response = await fetch(url, {
      method: httpMethod,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([timeoutSignal, ...(parentSignal ? [parentSignal] : [])]),
    });
    const value: any = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new ProviderApiError(
        response.status,
        'YouTube Data API request failed',
        'youtube',
        'youtube-default',
        { providerCode: value.error?.errors?.[0]?.reason },
      );
    return { value: value as T, quotaCost: YOUTUBE_QUOTA_COST[method] ?? 1 };
  }
}
