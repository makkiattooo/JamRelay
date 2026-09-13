import { SpotifyAuth } from './auth.js';
import { SpotifyApiError, normalizeSpotifyError } from './errors.js';
import type { Logger } from 'pino';
import { toolContext } from '../mcp/context.js';
const knownNoContentMutations = new Set([
  'PUT /me/player/play',
  'PUT /me/player/pause',
  'PUT /me/player/seek',
  'PUT /me/player/volume',
  'PUT /me/player',
  'POST /me/player/next',
  'POST /me/player/previous',
]);
function isKnownNoContentMutation(method: string, path: string) {
  return knownNoContentMutations.has(method + ' ' + path.split('?')[0]);
}
export class SpotifyClient {
  constructor(
    private auth: SpotifyAuth,
    private market = 'PL',
    private logger?: Logger,
  ) {}
  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T | null> {
    let retryCount = 0;
    let forcedRefreshPerformed = false;
    let forceRefresh = false;
    const method = (init.method ?? 'GET').toUpperCase();
    for (;;) {
      const token = await this.auth.accessToken(forceRefresh);
      forceRefresh = false;
      if (!token)
        throw new SpotifyApiError(
          401,
          'reauthorization_required',
          'Spotify is not connected. Visit /auth/spotify/login.',
          undefined,
          true,
        );
      const headers = new Headers(init.headers);
      headers.set('Authorization', 'Bearer ' + token);
      headers.set('Accept', 'application/json');
      const controller = new AbortController();
      const parentSignal = toolContext.get()?.signal;
      const signal = parentSignal
        ? AbortSignal.any([parentSignal, controller.signal])
        : controller.signal;
      const timer = setTimeout(() => controller.abort(), 8000);
      let response: Response;
      try {
        const started = Date.now();
        const requestPath =
          path.startsWith('/search') && !path.includes('market=')
            ? path + (path.includes('?') ? '&' : '?') + 'market=' + encodeURIComponent(this.market)
            : path;
        response = await fetch('https://api.spotify.com/v1' + requestPath, {
          ...init,
          headers,
          signal,
        });
        this.logger?.info(
          {
            event: 'spotify_request',
            request_id: toolContext.get()?.requestId,
            path: requestPath,
            status: response.status,
            latency_ms: Date.now() - started,
            retry: retryCount,
          },
          'Spotify API request',
        );
      } finally {
        clearTimeout(timer);
      }
      if (response.status === 401 && !forcedRefreshPerformed) {
        forcedRefreshPerformed = true;
        forceRefresh = true;
        continue;
      }
      const retryHeader = response.headers.get('retry-after');
      const retryAfter =
        retryHeader && /^\d+(?:\.\d+)?$/.test(retryHeader) ? Number(retryHeader) : undefined;
      const raw = await response.text();
      const trimmed = raw.trim();
      let body: unknown = undefined;
      let invalidJson = false;
      if (trimmed) {
        try {
          body = JSON.parse(trimmed);
        } catch {
          invalidJson = true;
        }
      }
      if (response.ok) {
        if (response.status === 204 || !trimmed) return null;
        if (invalidJson) {
          this.logger?.warn(
            {
              event: 'spotify_non_json_success',
              method,
              path,
              status: response.status,
              content_type: response.headers.get('content-type'),
              content_length: response.headers.get('content-length'),
              response_body: trimmed.slice(0, 500),
            },
            'Spotify returned non-JSON success response',
          );
          if (isKnownNoContentMutation(method, path)) return null;
          throw new SpotifyApiError(
            response.status,
            'invalid_json',
            'Spotify returned invalid JSON.',
          );
        }
        return body as T;
      }
      this.logger?.warn(
        {
          event: 'spotify_error_response',
          request_id: toolContext.get()?.requestId,
          method: init.method ?? 'GET',
          path,
          status: response.status,
          error_body: trimmed.slice(0, 500),
        },
        'Spotify returned an error response',
      );
      const error = normalizeSpotifyError(response.status, body, retryAfter, trimmed);
      const safe = method === 'GET';
      if (retry && safe && retryCount < 2 && [429, 502, 503, 504].includes(response.status)) {
        retryCount++;
        const delay = error.retryAfter ?? Math.pow(2, retryCount - 1);
        const remaining = toolContext.get()?.deadlineAt
          ? toolContext.get()!.deadlineAt - Date.now()
          : Number.POSITIVE_INFINITY;
        if (delay * 1000 >= remaining) throw error;
        this.logger?.warn(
          {
            event: 'spotify_retry',
            request_id: toolContext.get()?.requestId,
            path,
            status: response.status,
            retry_after: error.retryAfter,
          },
          'Retrying safe Spotify request',
        );
        await new Promise((resolve) => setTimeout(resolve, (delay + Math.random()) * 1000));
        continue;
      }
      if (response.status === 401)
        throw new SpotifyApiError(
          401,
          'reauthorization_required',
          'Spotify authorization was rejected after refresh.',
          undefined,
          true,
        );
      throw error;
    }
  }
  json<T>(path: string, body: unknown, method = 'POST') {
    return this.request<T>(
      path,
      { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      false,
    );
  }
}
