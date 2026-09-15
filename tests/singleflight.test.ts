import { describe, expect, it } from 'vitest';
import { Singleflight } from '../src/utils/singleflight.js';

describe('Singleflight', () => {
  it('shares identical in-flight work and clears completed entries', async () => {
    const singleflight = new Singleflight();
    let calls = 0;
    const operation = async () => ++calls;
    expect(
      await Promise.all([singleflight.do('same', operation), singleflight.do('same', operation)]),
    ).toEqual([1, 1]);
    expect(await singleflight.do('same', operation)).toBe(2);
  });
});
