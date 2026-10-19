import { describe, expect, it } from 'vitest';
import { retryAfterSeconds } from '../src/providers/retry-after.js';
describe('Retry-After parsing', () => {
  it('accepts seconds, HTTP dates and rejects malformed headers', () => {
    expect(retryAfterSeconds('12.5', 0)).toBe(13);
    expect(retryAfterSeconds('Thu, 01 Jan 1970 00:02:00 GMT', 0)).toBe(120);
    expect(retryAfterSeconds('invalid', 0)).toBeUndefined();
    expect(retryAfterSeconds(null)).toBeUndefined();
  });
});
