# Errors and status codes

Errors can appear as HTTP responses, MCP tool errors, or structured Spotify error objects. The original provider status is preserved even when its body is empty or malformed.

## HTTP error contract

Application JSON endpoints return errors in the following stable shape:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests.",
    "details": null,
    "request_id": "req_01K4..."
  }
}
```

`X-Request-ID` is returned on every response and can be supplied by a trusted caller when it matches the documented safe character set. The value is also available in server logs. Unexpected failures always return `500 INTERNAL_ERROR`; infrastructure details are logged server-side only. Malformed JSON returns `400 INVALID_JSON`.

Rate-limited application responses return `429 RATE_LIMIT_EXCEEDED` and should include `Retry-After`. Clients may retry `429`, `502`, `503`, and `504` with exponential backoff and jitter, while respecting `Retry-After`; validation, authentication, authorization, not-found, and conflict errors are not automatically retried.

MCP tool failures use the same stable application code inside an `isError: true` tool result. For example, a persistent Spotify rate limit is returned with `code: RATE_LIMIT_EXCEEDED`, `details.spotify_status: 429`, and `details.retry_after` when Spotify supplied that value. The MCP transport itself may still use HTTP `200`, because the failure belongs to the tool result.

## Application and Spotify errors

| Code                                 | Meaning                                                          | Action                                           |
| ------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------ |
| `reauthorization_required`           | A provider authorization is disconnected or refresh was rejected | Reconnect from `/auth/providers/:provider/start` |
| `spotify_feature_removed`            | Provider endpoint is no longer available                         | Use another supported workflow                   |
| `artist_top_tracks_endpoint_removed` | Specific removed-endpoint marker                                 | Expected for `get_artist_top_tracks`             |
| `invalid_json`                       | Unexpected malformed success body                                | Inspect logs and provider status                 |
| `rate_limited`                       | Spotify returned HTTP 429                                        | Respect `Retry-After`                            |
| `unauthorized`                       | Provider rejected authentication                                 | Reauthorize                                      |
| `forbidden`                          | Provider denied the operation                                    | Check scopes, account, Premium, ownership        |
| `not_found`                          | Provider returned HTTP 404                                       | Check identifier or endpoint availability        |
| `http_<status>`                      | Non-JSON provider error                                          | Inspect status and sanitized message             |
| `spotify_api_error`                  | Other provider failure                                           | Inspect logs; retry only safe reads              |

## MCP OAuth errors

| HTTP  | JSON error                   | Cause                                                              |
| ----- | ---------------------------- | ------------------------------------------------------------------ |
| `400` | `invalid_grant`              | Expired/reused/mismatched code, bad PKCE, or invalid refresh token |
| `401` | `invalid_client`             | Wrong OAuth client ID or secret                                    |
| `401` | `Authorization denied`       | Wrong owner secret or authorization parameters                     |
| `429` | `rate_limited` / `slow_down` | More than 30 OAuth requests per IP per minute                      |
| `503` | `OAuth is not configured`    | Required OAuth configuration is unavailable                        |

## Input validation

Zod validates inputs before tool callbacks. Invalid examples include empty IDs, negative offsets, unsupported time ranges, more than 50 items in a paged read, more than 10,000 IDs in bulk operations, mutually exclusive `before`/`after`, `context_uri`/`uris`, and public collaborative playlists.

## Empty responses and retries

Successful `204`, empty, or whitespace-only responses normalize to `null`. Known no-content playback mutations also accept non-JSON success bodies. Other successful endpoints require valid JSON. Safe GET requests retry bounded 429/5xx failures; writes are not automatically retried.
