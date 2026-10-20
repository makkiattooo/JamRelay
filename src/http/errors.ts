import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { SpotifyApiError } from '../spotify/errors.js';
import { CapabilityUnavailableError, ProviderSelectionError } from '../providers/errors.js';
import { ProviderApiError } from '../providers/errors.js';

export type ApiErrorDetails = Record<string, unknown> | null;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: ApiErrorDetails = null,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const providerNotConfigured = () =>
  new ApiError(
    503,
    'PROVIDER_NOT_CONFIGURED',
    'No music provider is configured for this deployment.',
  );

export const requestId: RequestHandler = (req, res, next) => {
  const supplied = req.header('x-request-id');
  const id =
    supplied && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(supplied)
      ? supplied
      : `req_${randomUUID()}`;
  res.locals.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
};

export function sendApiError(res: Response, error: ApiError) {
  if (error.retryAfter !== undefined) res.setHeader('Retry-After', String(error.retryAfter));
  return res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== null ? { details: error.details } : {}),
      request_id: res.locals.requestId,
    },
  });
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error && error.message === 'provider_connection_conflict')
    return new ApiError(
      400,
      'PROVIDER_TARGET_CONFLICT',
      'The selected provider and connection do not match. Use get_connections to select one consistent target.',
    );
  if (error instanceof Error && error.message === 'NO_MUSIC_ACCOUNTS')
    return new ApiError(
      409,
      'NO_MUSIC_ACCOUNTS',
      'No music account is configured. The owner should run jamrelay connect provider spotify (or another provider), authorize their account, then approve the client connection again.',
    );
  if (error instanceof Error && error.message === 'MUSIC_ACCOUNT_AUTH_REQUIRED')
    return new ApiError(
      401,
      'MUSIC_ACCOUNT_AUTH_REQUIRED',
      'The selected music account needs authorization. The owner should sign in at /owner/login, approve the provider authorization, then retry.',
    );
  if (error instanceof Error && error.message === 'PERMISSION_NOT_GRANTED')
    return new ApiError(
      403,
      'PERMISSION_NOT_GRANTED',
      'The owner can approve the required scope or tool using jamrelay clients permissions set <client-id>. Refresh the client tool list after approval.',
    );
  if (error instanceof Error && error.message === 'CONNECTION_NOT_GRANTED')
    return new ApiError(
      403,
      'CONNECTION_NOT_GRANTED',
      'This music account is not in the current MCP grant. Ask the owner to authorize the provider and allow its connection using jamrelay clients permissions set <client-id>.',
    );
  if (error instanceof Error && ['JOB_ACCESS_DENIED', 'CLIENT_REVOKED'].includes(error.message))
    return new ApiError(
      403,
      error.message,
      error.message === 'CLIENT_REVOKED'
        ? 'This MCP authorization was revoked. Ask the owner to authorize a new connection.'
        : 'This job belongs to a different OAuth registration or music account.',
    );
  if (error instanceof Error && error.message === 'CONNECTION_UNAVAILABLE')
    return new ApiError(
      409,
      'CONNECTION_UNAVAILABLE',
      'The selected connection is unavailable. Ask the owner to check account authorization and provider configuration.',
    );
  if (error instanceof CapabilityUnavailableError)
    return new ApiError(
      501,
      'CAPABILITY_UNAVAILABLE',
      'This provider does not support the requested operation, or no authorized account can perform it. Check get_capabilities and provider authorization.',
      {
        capability: error.capability,
        ...(error.provider ? { provider: error.provider } : {}),
        ...(error.connectionId ? { connection_id: error.connectionId } : {}),
      },
    );
  if (error instanceof ProviderSelectionError)
    return new ApiError(409, 'PROVIDER_TARGET_REQUIRED', error.message, {
      operation: error.operation,
      candidates: error.candidates,
    });
  if (error instanceof ProviderApiError) {
    const status =
      error.status === 429
        ? 429
        : error.status === 401
          ? 401
          : error.status === 403
            ? 403
            : error.status === 404
              ? 404
              : error.status >= 500
                ? 502
                : 502;
    return new ApiError(
      status,
      error.status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'PROVIDER_UPSTREAM_ERROR',
      error.message,
      {
        provider: error.provider,
        connection_id: error.connectionId,
        upstream_status: error.status,
        scope: error.scope,
        capability: error.capability,
        ...(error.providerCode ? { provider_code: error.providerCode } : {}),
      },
      error.retryAfter,
    );
  }
  const coded = error as { code?: string } | null;
  if (coded?.code === 'snapshot_target_mismatch')
    return new ApiError(
      409,
      'SNAPSHOT_TARGET_MISMATCH',
      'Snapshot belongs to another provider connection.',
    );
  if (error instanceof SpotifyApiError) {
    if (error.status === 429)
      return new ApiError(
        429,
        'RATE_LIMIT_EXCEEDED',
        error.message,
        {
          spotify_status: error.status,
          scope: error.scope,
          persisted: true,
          blocked_until: error.retryAfter ? Date.now() + error.retryAfter * 1000 : undefined,
        },
        error.retryAfter,
      );
    if (error.status === 401)
      return new ApiError(
        401,
        'AUTH_REQUIRED',
        'Music account authorization expired or is missing. Ask the owner to authorize the provider again.',
      );
    if (error.status === 403)
      return new ApiError(
        403,
        'ACCESS_DENIED',
        'The provider rejected the operation. Check provider scopes, app access restrictions, playlist ownership and account eligibility.',
      );
    if (error.status === 404) return new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
    if (error.status >= 500)
      return new ApiError(
        error.status === 504 ? 504 : 502,
        error.status === 504 ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
        'A dependency failed.',
      );
  }
  const candidate = error as { type?: string; status?: number } | null;
  if (error instanceof Error && error.message === 'tool_execution_timeout')
    return new ApiError(504, 'TOOL_EXECUTION_TIMEOUT', 'The tool exceeded its execution deadline.');
  if (error instanceof Error && error.name === 'AbortError')
    return new ApiError(504, 'UPSTREAM_TIMEOUT', 'The upstream service did not respond in time.');
  if (candidate?.type === 'entity.parse.failed')
    return new ApiError(400, 'INVALID_JSON', 'Invalid JSON.');
  if (candidate?.status === 413)
    return new ApiError(400, 'INVALID_REQUEST', 'Request is too large.');
  return new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}

export const apiErrorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (res.headersSent) return _next(error);
  return sendApiError(res, toApiError(error));
};
