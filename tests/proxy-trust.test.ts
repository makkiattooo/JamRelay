import express from 'express';
import { expect, it } from 'vitest';

function clientIp(trust: boolean | string | string[], peer: string) {
  const app = express();
  app.set('trust proxy', trust);
  const req = Object.assign(Object.create(app.request), {
    app,
    socket: { remoteAddress: peer },
    headers: { 'x-forwarded-for': '203.0.113.20' },
  });
  return req.ip;
}
it('rejects IPv4 spoofing through overly broad mapped IPv6 and zero-leading IPv6 subnets', () => {
  for (const subnet of ['::ffff:10.0.0.0/8', '::/1'])
    for (const trust of [subnet, [subnet, '192.0.2.0/24']])
      for (const peer of ['198.51.100.10', '::ffff:198.51.100.10'])
        expect(clientIp(trust, peer)).toBe(peer);
});
it('preserves legitimate IPv4/IPv6 trust and the server’s existing boolean policy', () => {
  for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104'])
    expect(clientIp(subnet, '10.0.0.1')).toBe('203.0.113.20');
  expect(clientIp('2001:db8::/32', '2001:db8::1')).toBe('203.0.113.20');
  expect(clientIp(false, '127.0.0.1')).toBe('127.0.0.1');
  expect(clientIp(true, '127.0.0.1')).toBe('203.0.113.20');
});
