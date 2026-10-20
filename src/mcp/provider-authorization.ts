import { ownerCredentialMatches, ownerCredentialFields } from './owner-password.js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type express from 'express';
import { OwnerSessionStore } from './owner-session.js';
import { oauthPageHeaders } from './oauth-authorize-page.js';

export const secretMatches = (a: string, b: string) =>
  Boolean(b) &&
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export const authPage = (title: string, body: string) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(title)}</title><h1>${escape(title)}</h1>${body}</html>`;
export const authResultPage = (
  _provider: string,
  ok: boolean,
  message: string,
  _requestId?: string,
) => authPage(ok ? 'Authorization completed' : 'Authorization failed', `<p>${escape(message)}</p>`);

/** Only owner consent creates records. Provider state alone cannot authorize a write. */
export class ProviderInitiations {
  private active = new Set<string>();
  private records = new Map<
    string,
    { provider: string; connection: string; session: string; expires: number }
  >();
  constructor(private ttl = 10 * 60_000) {}
  approve(state: string, provider: string, connection: string, session: string) {
    if (this.active.has(connection)) throw new Error('AUTHORIZATION_IN_PROGRESS');
    for (const [key, r] of this.records) if (r.expires <= Date.now()) this.records.delete(key);
    if (this.records.size >= 1000) throw new Error('AUTHORIZATION_CAPACITY');
    // A newer approval supersedes older attempts for this exact connection.
    for (const [key, r] of this.records) if (r.connection === connection) this.records.delete(key);
    this.records.set(state, { provider, connection, session, expires: Date.now() + this.ttl });
  }
  consume(state: string, provider: string, connection: string, session: string) {
    const r = this.records.get(state);
    if (
      !r ||
      r.provider !== provider ||
      r.connection !== connection ||
      r.session !== session ||
      r.expires <= Date.now()
    )
      throw new Error('UNAPPROVED_AUTHORIZATION');
    if (this.active.has(connection)) throw new Error('AUTHORIZATION_IN_PROGRESS');
    this.active.add(connection);
    this.records.delete(state); // reserve before any await / external exchange
  }
  finish(connection: string) {
    this.active.delete(connection);
  }
}

export function registerOwnerAuthentication(
  app: express.Express,
  secret: string,
  baseUrl: string,
  passwordHash?: string,
) {
  const sessions = new OwnerSessionStore();
  const secure = new URL(baseUrl).protocol === 'https:';
  const attrs = `; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  const cookie = (req: express.Request, name: string) =>
    (req.header('cookie') ?? '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + '='))
      ?.slice(name.length + 1);
  const owner = (req: express.Request) => sessions.get(cookie(req, 'jamrelay_owner'));
  const csrf = (req: express.Request) => {
    const s = owner(req);
    return Boolean(
      s && secretMatches(String(req.body?.csrf_token ?? req.header('x-csrf-token') ?? ''), s.csrf),
    );
  };
  const attempts = new Map<string, { count: number; until: number }>();
  const allowed = (req: express.Request) => {
    const now = Date.now();
    for (const [key, r] of attempts) if (r.until <= now) attempts.delete(key);
    const key = req.ip ?? 'unknown';
    if (!attempts.has(key) && attempts.size >= 2048) return false;
    const r = attempts.get(key) ?? { count: 0, until: now + 5 * 60_000 };
    attempts.set(key, r);
    return ++r.count <= 10;
  };
  const returnPath = (value: unknown) =>
    typeof value === 'string' &&
    /^\/auth\/providers\/(spotify|soundcloud|youtube)\/start$/.test(value)
      ? value
      : '';
  app.get('/owner/login', (req, res) => {
    const nonce = randomBytes(24).toString('base64url');
    res
      .set(oauthPageHeaders)
      .setHeader('Set-Cookie', `jamrelay_login=${nonce}${attrs}; Max-Age=600`)
      .type('html')
      .send(
        authPage(
          'Owner authentication',
          `<form method="post" action="/owner/login"><input type="hidden" name="csrf_token" value="${nonce}"><input type="hidden" name="next" value="${escape(returnPath(req.query.next))}">${ownerCredentialFields(Boolean(passwordHash))}<button>Sign in</button></form>`,
        ),
      );
  });
  app.post('/owner/login', async (req, res) => {
    if (!allowed(req))
      return res.status(429).set('Retry-After', '300').json({ error: 'RATE_LIMITED' });
    const nonce = cookie(req, 'jamrelay_login');
    const origin = req.header('origin');
    if (
      !nonce ||
      !secretMatches(String(req.body?.csrf_token ?? ''), nonce) ||
      (origin && origin !== new URL(baseUrl).origin)
    )
      return res.status(403).json({ error: 'CSRF_REQUIRED' });
    if (!(await ownerCredentialMatches(req.body ?? {}, secret, passwordHash)))
      return res.status(401).json({
        error: 'OWNER_AUTH_REQUIRED',
        message: 'Invalid owner credentials. Try again or use recovery.',
      });
    const session = sessions.authenticate(secret, secret);
    if (!session) return res.status(401).json({ error: 'OWNER_AUTH_REQUIRED' });
    sessions.revoke(cookie(req, 'jamrelay_owner'));
    res
      .set(oauthPageHeaders)
      .setHeader('Set-Cookie', [
        `jamrelay_owner=${session.token}${attrs}; Max-Age=1800`,
        `jamrelay_login=${attrs}; Max-Age=0`,
      ]);
    const next = returnPath(req.body?.next);
    if (next) return res.redirect(303, next);
    return res
      .type('html')
      .send(
        authPage(
          'Owner authenticated',
          `<p>Open the configured provider authorization URL to approve a connection.</p><form method="post" action="/owner/logout"><input type="hidden" name="csrf_token" value="${session.csrf}"><button>Sign out</button></form>`,
        ),
      );
  });
  app.post('/owner/logout', (req, res) => {
    if (!owner(req) || !csrf(req)) return res.status(403).json({ error: 'CSRF_REQUIRED' });
    sessions.revoke(cookie(req, 'jamrelay_owner'));
    return res.setHeader('Set-Cookie', `jamrelay_owner=${attrs}; Max-Age=0`).status(204).end();
  });
  return { owner, csrf, allowed };
}

export const providerConsentPage = (provider: string, connection: string, csrf: string) =>
  authPage(
    'Authorize provider connection',
    `<p>Connect or replace ${escape(connection)} on ${escape(provider)}. Existing credentials will change only after successful authorization.</p><form method="post" action="/auth/providers/${encodeURIComponent(provider)}/start"><input type="hidden" name="csrf_token" value="${escape(csrf)}"><input type="hidden" name="connection_id" value="${escape(connection)}"><button>Approve connection or replacement</button></form>`,
  );
