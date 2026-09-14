import { randomBytes, timingSafeEqual } from 'node:crypto';

export type OwnerSession = { token: string; csrf: string; expiresAt: number };
export class OwnerSessionStore {
  private sessions = new Map<string, OwnerSession>();
  constructor(private readonly ttlMs = 30 * 60_000) {}
  authenticate(secret: string, expected: string) {
    const a = Buffer.from(secret),
      b = Buffer.from(expected);
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
    const session = {
      token: randomBytes(32).toString('base64url'),
      csrf: randomBytes(24).toString('base64url'),
      expiresAt: Date.now() + this.ttlMs,
    };
    this.sessions.set(session.token, session);
    return session;
  }
  get(token: string | undefined) {
    const session = token ? this.sessions.get(token) : undefined;
    if (!session || session.expiresAt <= Date.now()) {
      if (token) this.sessions.delete(token);
      return undefined;
    }
    return session;
  }
  rotate(token: string) {
    const old = this.get(token);
    if (!old) return undefined;
    this.sessions.delete(token);
    const session = {
      token: randomBytes(32).toString('base64url'),
      csrf: randomBytes(24).toString('base64url'),
      expiresAt: Date.now() + this.ttlMs,
    };
    this.sessions.set(session.token, session);
    return session;
  }
  revoke(token: string | undefined) {
    if (token) this.sessions.delete(token);
  }
}
