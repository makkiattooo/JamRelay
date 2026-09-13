export class SpotifyApiError extends Error {
  public apiErrorId?: number;
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
    public reauthorizationRequired = false,
    public scope?: string,
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}
export function normalizeSpotifyError(
  status: number,
  body: unknown,
  retryAfter?: number,
  rawBody?: string,
) {
  const b = body as
    | { error?: { status?: number; message?: string; reason?: string; code?: string } | string }
    | undefined;
  const detail = typeof b?.error === 'string' ? b.error : b?.error;
  const message =
    typeof detail === 'string'
      ? detail
      : detail?.message ||
        rawBody?.trim() ||
        `Spotify API returned HTTP ${status} with an empty response body.`;
  const providerCode = typeof detail === 'object' ? (detail.reason ?? detail.code) : undefined;
  const code =
    providerCode ||
    (!body && rawBody?.trim()
      ? `http_${status}`
      : status === 401
        ? 'unauthorized'
        : status === 403
          ? 'forbidden'
          : status === 404
            ? 'not_found'
            : status === 429
              ? 'rate_limited'
              : 'spotify_api_error');
  return new SpotifyApiError(status, code, message, retryAfter, status === 401);
}
