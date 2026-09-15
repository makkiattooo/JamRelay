import { describe, expect, it } from 'vitest';
import { mapLimit } from '../src/utils/concurrency.js';

describe('mapLimit', () => {
  it('preserves order and enforces the configured maximum', async () => {
    let active = 0;
    let maximum = 0;
    const result = await mapLimit([0, 1, 2, 3, 4, 5], { concurrency: 2 }, async (value) => {
      active++;
      maximum = Math.max(maximum, active);
      const output = value * 2;
      active--;
      return output;
    });
    expect(result).toEqual([0, 2, 4, 6, 8, 10]);
    expect(maximum).toBeLessThanOrEqual(2);
  });

  it('stops scheduling after cancellation', async () => {
    const controller = new AbortController();
    const started: number[] = [];
    await expect(
      mapLimit([0, 1, 2, 3], { concurrency: 1, signal: controller.signal }, async (value) => {
        started.push(value);
        controller.abort();
        return value;
      }),
    ).rejects.toThrow('operation_cancelled');
    expect(started).toEqual([0]);
  });
});
