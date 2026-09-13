import { SpotifyAuth } from './auth.js';
import { SpotifyApiError, normalizeSpotifyError } from './errors.js';
import type { Logger } from 'pino';
import { toolContext } from '../mcp/context.js';
import { clearRateLimit, getRateLimit, recordApiError, recordRateLimit } from '../db/state.js';
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
    const endpoint = path.split('?')[0] || '/';
    const scope = endpoint === '/search' ? 'search' : endpoint;
    const blocked = getRateLimit('spotify', scope);
    if (blocked && blocked.blockedUntil !== null) {
      const remaining = Math.max(1, Math.ceil((blocked.blockedUntil - Date.now()) / 1000));
      throw new SpotifyApiError(
        429,
        'RATE_LIMIT_EXCEEDED',
        `Spotify ${scope} is rate limited until ${new Date(blocked.blockedUntil).toISOString()}.`,
        remaining,
        false,
        scope,
      );
    }
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
            path: requestPath.split('?')[0],
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
        clearRateLimit('spotify', scope);
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
          path: endpoint,
          status: response.status,
          reason: String(response.status),
        },
        'Spotify returned an error response',
      );
      const error = normalizeSpotifyError(response.status, body, retryAfter, trimmed);
      recordApiError({
        provider: 'spotify',
        endpoint,
        method,
        statusCode: response.status,
        reason: error.code,
        message: error.message,
        retryAfterSeconds: retryAfter,
        requestId: toolContext.get()?.requestId,
        operation: toolContext.get()?.operation,
      });
      if (response.status === 429) {
        const seconds = Math.ceil(retryAfter ?? 60);
        recordRateLimit('spotify', scope, seconds, error.code);
        throw new SpotifyApiError(429, 'RATE_LIMIT_EXCEEDED', error.message, seconds, false, scope);
      }
      const safe = method === 'GET';
      if (retry && safe && retryCount < 2 && [502, 503, 504].includes(response.status)) {
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
