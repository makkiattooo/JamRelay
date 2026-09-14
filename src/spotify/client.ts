import { SpotifyAuth } from './auth.js';
import { SpotifyApiError, normalizeSpotifyError } from './errors.js';
import type { Logger } from 'pino';
import { toolContext } from '../mcp/context.js';
import {
  clearRateLimit,
  getRateLimit,
  recordApiError,
  recordRateLimit,
  indexCanonicalTrack,
} from '../db/state.js';
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
function warmCanonicalTracks(value: unknown, seen = new Set<unknown>(), budget = { n: 0 }): void {
  if (!value || typeof value !== 'object' || seen.has(value) || budget.n >= 500) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) warmCanonicalTracks(item, seen, budget);
    return;
  }
  const x = value as Record<string, unknown>;
  if (
    x.type === 'track' ||
    (typeof x.id === 'string' &&
      typeof x.uri === 'string' &&
      typeof x.name === 'string' &&
      Array.isArray(x.artists) &&
      x.album)
  ) {
    budget.n++;
    indexCanonicalTrack(x as any);
  }
  for (const child of Object.values(x)) warmCanonicalTracks(child, seen, budget);
}
export class SpotifyClient {
  private apiCallTotal = 0;
  private apiCallsByEndpoint = new Map<string, number>();
  constructor(
    private auth: SpotifyAuth,
    private market = 'PL',
    private logger?: Logger,
  ) {}
  getApiCallMetrics() {
    return {
      total: this.apiCallTotal,
      by_endpoint: Object.fromEntries(this.apiCallsByEndpoint),
    };
  }
  resetApiCallMetrics() {
    this.apiCallTotal = 0;
    this.apiCallsByEndpoint.clear();
  }
  getApiCallDelta(before: ReturnType<SpotifyClient['getApiCallMetrics']>) {
    const current = this.getApiCallMetrics();
    const byEndpoint: Record<string, number> = {};
    for (const [endpoint, count] of Object.entries(current.by_endpoint)) {
      const delta = count - (before.by_endpoint[endpoint] ?? 0);
      if (delta > 0) byEndpoint[endpoint] = delta;
    }
    return { total: current.total - before.total, by_endpoint: byEndpoint };
  }
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
          'Spotify is not connected. Visit /auth/providers/spotify/start.',
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
        this.apiCallTotal++;
        const endpointKey = `${method} ${requestPath.split('?')[0]}`;
        this.apiCallsByEndpoint.set(
          endpointKey,
          (this.apiCallsByEndpoint.get(endpointKey) ?? 0) + 1,
        );
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
        warmCanonicalTracks(body);
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
      const apiError = recordApiError({
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
      if (apiError) error.apiErrorId = apiError.id;
      if (response.status === 429) {
        const seconds = Math.ceil(retryAfter ?? 60);
        recordRateLimit('spotify', scope, seconds, error.code);
        const rateError = new SpotifyApiError(
          429,
          'RATE_LIMIT_EXCEEDED',
          error.message,
          seconds,
          false,
          scope,
        );
        rateError.apiErrorId = error.apiErrorId;
        throw rateError;
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
