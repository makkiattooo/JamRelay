import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import express from 'express';
import { z } from 'zod';
import type { Config } from '../config.js';
import {
  oauthPageHeaders,
  renderAuthorizePage,
  renderOAuthErrorPage,
} from './oauth-authorize-page.js';

type TokenEndpointAuthMethod = 'none' | 'client_secret_basic' | 'client_secret_post';

type Code = {
  clientId: string;
  redirectUri: string;
  challenge: string;
  resource?: string;
  expiresAt: number;
  used: boolean;
};

type Access = {
  clientId?: string;
  expiresAt: number;
  resource?: string;
};

type Refresh = {
  clientId: string;
  expiresAt: number;
  resource?: string;
};

type DynamicClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  clientSecretDigest?: string;
  applicationType?: 'native' | 'web';
  createdAt: number;
  lastUsedAt: number;
  authorizedAt?: number;
};

type State = {
  codes: Record<string, Code>;
  access: Record<string, Access>;
  refresh: Record<string, Refresh>;
  clients: Record<string, DynamicClient>;
  grants: Record<
    string,
    {
      clientId: string;
      connectionIds: string[];
      permissions: string[];
      revokedAt?: number;
      updatedAt: number;
    }
  >;
};

export type OAuthClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethods: TokenEndpointAuthMethod[];
  clientSecret?: string;
  clientSecretDigest?: string;
  source: 'static' | 'dynamic';
};

const emptyState = (): State => ({ codes: {}, access: {}, refresh: {}, clients: {}, grants: {} });
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const pkce = (value: string) => createHash('sha256').update(value).digest('base64url');
const token = () => randomBytes(32).toString('base64url');
const same = (a: string, b: string) => {
  const x = Buffer.from(digest(a), 'hex');
  const y = Buffer.from(digest(b), 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
};
const sameDigest = (candidate: string, expectedDigest: string) => {
  const x = Buffer.from(digest(candidate), 'hex');
  const y = Buffer.from(expectedDigest, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
};
const staticClientSchema = z
  .object({
    clientId: z.string().min(1),
    clientName: z.string().min(1).optional(),
    clientSecret: z.string().min(1).optional(),
    redirectUris: z.array(z.string().min(1)).min(1).max(20),
    tokenEndpointAuthMethods: z
      .array(z.enum(['none', 'client_secret_basic', 'client_secret_post']))
      .min(1)
      .max(3)
      .optional(),
    applicationType: z.enum(['native', 'web']).optional(),
  })
  .superRefine((value, ctx) => {
    const methods =
      value.tokenEndpointAuthMethods ??
      (value.clientSecret ? ['client_secret_basic', 'client_secret_post'] : ['none']);
    if (methods.some((method) => method !== 'none') && !value.clientSecret) {
      ctx.addIssue({
        code: 'custom',
        message: 'clientSecret is required for client_secret_* authentication methods',
      });
    }
  });

const staticRegistrySchema = z.union([
  z.array(staticClientSchema),
  z.object({ clients: z.array(staticClientSchema) }),
]);

type StaticClientInput = z.infer<typeof staticClientSchema>;

const allowedRedirectUri = (value: string, applicationType?: 'native' | 'web') => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') {
    const host = url.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  }

  // RFC 8252 native apps may use a private-use URI scheme. Only accept those
  // when the client explicitly declares itself as native, and reject schemes
  // that browsers interpret as content or local-file handlers.
  if (applicationType !== 'native') return false;
  if (!/^[a-z][a-z0-9+.-]*:$/.test(url.protocol)) return false;
  return !['file:', 'data:', 'javascript:', 'vbscript:', 'blob:', 'about:'].includes(
    url.protocol.toLowerCase(),
  );
};

const normalizeStaticClient = (input: StaticClientInput): OAuthClient => ({
  clientId: input.clientId,
  clientName: input.clientName ?? input.clientId,
  clientSecret: input.clientSecret,
  redirectUris: [...new Set(input.redirectUris)],
  tokenEndpointAuthMethods:
    input.tokenEndpointAuthMethods ??
    (input.clientSecret ? ['client_secret_basic', 'client_secret_post'] : ['none']),
  source: 'static',
});

class StaticOAuthClientRegistry {
  private loaded = false;
  private clients = new Map<string, OAuthClient>();

  constructor(private readonly path: string) {}

  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = staticRegistrySchema.parse(JSON.parse(await readFile(this.path, 'utf8')));
      const list = Array.isArray(parsed) ? parsed : parsed.clients;
      for (const raw of list) {
        const client = normalizeStaticClient(raw);
        if (this.clients.has(client.clientId)) {
          throw new Error(`Duplicate MCP OAuth clientId in ${this.path}: ${client.clientId}`);
        }
        if (client.redirectUris.some((uri) => !allowedRedirectUri(uri, raw.applicationType))) {
          throw new Error(`Unsafe redirect URI configured for MCP OAuth client ${client.clientId}`);
        }
        this.clients.set(client.clientId, client);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.loaded = false;
      throw error;
    }
  }

  async get(clientId: string) {
    await this.load();
    return this.clients.get(clientId);
  }
}

export class McpOAuthStore {
  private state: State = emptyState();
  private loaded = false;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly path = '/data/mcp-oauth.json') {}

  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<State>;
      this.state = {
        codes: parsed.codes ?? {},
        access: parsed.access ?? {},
        refresh: parsed.refresh ?? {},
        clients: parsed.clients ?? {},
        grants: parsed.grants ?? {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.state = emptyState();
        return;
      }
      this.loaded = false;
      throw error;
    }
    this.pruneExpired();
  }

  private pruneExpired(now = Date.now()) {
    for (const [key, code] of Object.entries(this.state.codes)) {
      if (code.used || code.expiresAt <= now) delete this.state.codes[key];
    }
    for (const [key, access] of Object.entries(this.state.access)) {
      if (access.expiresAt <= now) delete this.state.access[key];
    }
    for (const [key, refresh] of Object.entries(this.state.refresh)) {
      if (refresh.expiresAt <= now) delete this.state.refresh[key];
    }

    const unapprovedTtl = 60 * 60_000;
    const clientTtl = 180 * 24 * 60 * 60_000;
    for (const [key, client] of Object.entries(this.state.clients)) {
      if (!client.authorizedAt && client.createdAt + unapprovedTtl <= now) {
        delete this.state.clients[key];
      } else if (client.lastUsedAt + clientTtl <= now) {
        delete this.state.clients[key];
      }
    }
  }

  private async save() {
    const snapshot = JSON.stringify(this.state);
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
      await writeFile(temporary, snapshot, { mode: 0o600 });
      await rename(temporary, this.path);
    });
    return this.writing;
  }

  async issueCode(input: Omit<Code, 'expiresAt' | 'used'>) {
    await this.load();
    this.pruneExpired();
    const value = token();
    this.state.codes[digest(value)] = {
      ...input,
      expiresAt: Date.now() + 5 * 60_000,
      used: false,
    };
    await this.save();
    return value;
  }

  async exchangeCode(
    value: string,
    clientId: string,
    redirectUri: string,
    verifier: string,
    resource?: string,
  ) {
    await this.load();
    this.pruneExpired();
    const key = digest(value);
    const code = this.state.codes[key];
    if (
      !code ||
      code.used ||
      code.expiresAt <= Date.now() ||
      code.clientId !== clientId ||
      code.redirectUri !== redirectUri ||
      (resource && code.resource && code.resource !== resource) ||
      !same(pkce(verifier), code.challenge)
    ) {
      return false;
    }
    code.used = true;
    await this.save();
    return true;
  }

  async issueTokens(clientId: string, resource?: string) {
    await this.load();
    this.pruneExpired();
    const access = token();
    const refresh = token();
    this.state.access[digest(access)] = {
      clientId,
      expiresAt: Date.now() + 60 * 60_000,
      resource,
    };
    this.state.refresh[digest(refresh)] = {
      clientId,
      expiresAt: Date.now() + 30 * 24 * 60 * 60_000,
      resource,
    };
    await this.save();
    return { access, refresh };
  }

  async accessPolicy(value: string, resource?: string) {
    await this.load();
    this.pruneExpired();
    const record = this.state.access[digest(value)];
    if (
      !record ||
      record.expiresAt <= Date.now() ||
      (resource && record.resource && record.resource !== resource)
    )
      return undefined;
    const grant = record.clientId ? this.state.grants[record.clientId] : undefined;
    if (!grant || grant.revokedAt) return undefined;
    return {
      clientId: record.clientId!,
      connectionIds: grant.connectionIds,
      permissions: grant.permissions,
    };
  }

  async setGrant(clientId: string, connectionIds: string[], permissions: string[]) {
    await this.load();
    this.state.grants[clientId] = {
      clientId,
      connectionIds: [...new Set(connectionIds)],
      permissions: [...new Set(permissions)],
      updatedAt: Date.now(),
    };
    await this.save();
  }
  async getGrant(clientId: string) {
    await this.load();
    return this.state.grants[clientId] ?? null;
  }
  async listGrants() {
    await this.load();
    return Object.values(this.state.grants).map((grant) => ({ ...grant }));
  }
  async revokeGrant(clientId: string) {
    await this.load();
    const grant = this.state.grants[clientId];
    if (!grant) return false;
    grant.revokedAt = Date.now();
    await this.save();
    return true;
  }
  async updateGrant(clientId: string, connectionIds: string[], permissions: string[]) {
    return this.setGrant(clientId, connectionIds, permissions);
  }

  async useRefresh(value: string, clientId: string, resource?: string) {
    await this.load();
    this.pruneExpired();
    const key = digest(value);
    const record = this.state.refresh[key];
    if (
      !record ||
      record.expiresAt <= Date.now() ||
      record.clientId !== clientId ||
      (resource && record.resource && record.resource !== resource)
    ) {
      return undefined;
    }
    delete this.state.refresh[key];
    await this.save();
    return this.issueTokens(clientId, record.resource ?? resource);
  }

  async validAccess(value: string, resource?: string) {
    await this.load();
    this.pruneExpired();
    const record = this.state.access[digest(value)];
    return Boolean(
      record &&
      record.expiresAt > Date.now() &&
      (!resource || !record.resource || record.resource === resource),
    );
  }

  async registerDynamicClient(input: {
    clientName: string;
    redirectUris: string[];
    tokenEndpointAuthMethod: TokenEndpointAuthMethod;
    applicationType?: 'native' | 'web';
  }) {
    await this.load();
    this.pruneExpired();

    const maxDynamicClients = 128;
    const entries = Object.values(this.state.clients);
    if (entries.length >= maxDynamicClients) {
      const disposable = entries
        .filter((client) => !client.authorizedAt)
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (disposable) delete this.state.clients[disposable.clientId];
    }
    if (Object.keys(this.state.clients).length >= maxDynamicClients) {
      throw new Error('dynamic_client_limit_reached');
    }

    const clientId = `dcr_${randomBytes(24).toString('base64url')}`;
    const clientSecret =
      input.tokenEndpointAuthMethod === 'none' ? undefined : randomBytes(32).toString('base64url');
    const now = Date.now();
    this.state.clients[clientId] = {
      clientId,
      clientName: input.clientName,
      redirectUris: [...new Set(input.redirectUris)],
      tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
      clientSecretDigest: clientSecret ? digest(clientSecret) : undefined,
      applicationType: input.applicationType,
      createdAt: now,
      lastUsedAt: now,
    };
    await this.save();
    return { client: this.state.clients[clientId], clientSecret };
  }

  async getDynamicClient(clientId: string): Promise<OAuthClient | undefined> {
    await this.load();
    this.pruneExpired();
    const client = this.state.clients[clientId];
    if (!client) return undefined;
    return {
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUris: client.redirectUris,
      tokenEndpointAuthMethods: [client.tokenEndpointAuthMethod],
      clientSecretDigest: client.clientSecretDigest,
      source: 'dynamic',
    };
  }

  async touchDynamicClient(clientId: string, authorized = false) {
    await this.load();
    const client = this.state.clients[clientId];
    if (!client) return;
    client.lastUsedAt = Date.now();
    if (authorized) client.authorizedAt = client.authorizedAt ?? Date.now();
    await this.save();
  }
}

type OAuthConfig = Pick<
  Config,
  'PUBLIC_BASE_URL' | 'MCP_OAUTH_OWNER_SECRET' | 'MCP_OAUTH_CLIENTS_PATH' | 'MCP_OAUTH_DCR_ENABLED'
>;

const authenticateClient = (
  client: OAuthClient,
  method: TokenEndpointAuthMethod,
  secret?: string,
) => {
  if (!client.tokenEndpointAuthMethods.includes(method)) return false;
  if (method === 'none') return true;
  if (!secret) return false;
  if (client.clientSecretDigest) return sameDigest(secret, client.clientSecretDigest);
  if (client.clientSecret) return same(secret, client.clientSecret);
  return false;
};

type BasicClientResult =
  | { present: false }
  | { present: true; valid: false }
  | { present: true; valid: true; clientId: string; secret: string };

const readBasicClient = (header?: string): BasicClientResult => {
  if (!header) return { present: false };
  if (!header.startsWith('Basic ')) return { present: false };
  try {
    const encoded = header.slice(6).trim();
    if (!encoded) return { present: true, valid: false };
    const decoded = Buffer.from(encoded, 'base64').toString();
    const split = decoded.indexOf(':');
    if (split <= 0) return { present: true, valid: false };
    return {
      present: true,
      valid: true,
      clientId: decoded.slice(0, split),
      secret: decoded.slice(split + 1),
    };
  } catch {
    return { present: true, valid: false };
  }
};

export function registerMcpOAuthRoutes(
  app: express.Express,
  cfg: OAuthConfig,
  store: McpOAuthStore,
  connectionOptions: () => Array<{ id: string; provider: string; name: string }> = () => [],
) {
  const origin = cfg.PUBLIC_BASE_URL.replace(/\/$/, '');
  const resource = `${origin}/mcp`;
  const staticRegistry = new StaticOAuthClientRegistry(cfg.MCP_OAUTH_CLIENTS_PATH);
  const rateLimit = new Map<string, { at: number; count: number }>();

  const allowed = (req: express.Request) => {
    const now = Date.now();
    if (rateLimit.size > 2048) {
      for (const [ip, entry] of rateLimit) {
        if (now - entry.at > 5 * 60_000) rateLimit.delete(ip);
      }
    }
    const key = req.ip ?? 'unknown';
    const old = rateLimit.get(key);
    if (!old || now - old.at > 60_000) {
      rateLimit.set(key, { at: now, count: 1 });
      return true;
    }
    old.count++;
    return old.count <= 30;
  };

  const unavailable = (_req: express.Request, res: express.Response) =>
    res.status(503).json({ error: 'OAuth is not configured' });

  const rateLimited = (res: express.Response, code: string) =>
    res.status(429).set('Retry-After', '15').json({ error: code });

  const resolveClient = async (clientId: string): Promise<OAuthClient | undefined> => {
    const staticallyConfigured = await staticRegistry.get(clientId);
    if (staticallyConfigured) return staticallyConfigured;
    return store.getDynamicClient(clientId);
  };

  const validResource = (requested?: string) => !requested || requested === resource;

  const protectedResourceMetadata = {
    resource,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
  };
  app.get('/.well-known/oauth-protected-resource', (_req, res) =>
    res.json(protectedResourceMetadata),
  );
  // RFC 9728 path-suffixed discovery. Some clients probe this form first
  // when the protected resource itself is hosted at /mcp.
  app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) =>
    res.json(protectedResourceMetadata),
  );

  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    const metadata: Record<string, unknown> = {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    };
    if (cfg.MCP_OAUTH_OWNER_SECRET && cfg.MCP_OAUTH_DCR_ENABLED === 'true') {
      metadata.registration_endpoint = `${origin}/oauth/register`;
    }
    res.json(metadata);
  });

  app.post('/oauth/register', async (req, res) => {
    if (!cfg.MCP_OAUTH_OWNER_SECRET || cfg.MCP_OAUTH_DCR_ENABLED !== 'true') {
      return res.status(404).json({ error: 'dynamic_registration_disabled' });
    }
    if (!allowed(req)) return rateLimited(res, 'slow_down');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const applicationType = body.application_type;
    if (
      applicationType !== undefined &&
      applicationType !== 'native' &&
      applicationType !== 'web'
    ) {
      return res.status(400).json({ error: 'invalid_client_metadata' });
    }

    if (
      !Array.isArray(body.redirect_uris) ||
      body.redirect_uris.some((value) => typeof value !== 'string')
    ) {
      return res.status(400).json({ error: 'invalid_client_metadata' });
    }
    const redirectUris = [...new Set(body.redirect_uris as string[])];
    if (
      redirectUris.length === 0 ||
      redirectUris.length > 20 ||
      redirectUris.some(
        (uri) => !allowedRedirectUri(uri, applicationType as 'native' | 'web' | undefined),
      )
    ) {
      return res.status(400).json({ error: 'invalid_redirect_uri' });
    }

    const authMethod = String(body.token_endpoint_auth_method ?? 'none') as TokenEndpointAuthMethod;
    if (!['none', 'client_secret_basic', 'client_secret_post'].includes(authMethod)) {
      return res.status(400).json({ error: 'invalid_client_metadata' });
    }

    if (
      body.grant_types !== undefined &&
      (!Array.isArray(body.grant_types) ||
        body.grant_types.some((value) => typeof value !== 'string'))
    ) {
      return res.status(400).json({ error: 'invalid_client_metadata' });
    }
    const grantTypes =
      body.grant_types === undefined
        ? ['authorization_code', 'refresh_token']
        : (body.grant_types as string[]);
    if (
      grantTypes.length === 0 ||
      grantTypes.some((grant) => !['authorization_code', 'refresh_token'].includes(grant))
    ) {
      return res.status(400).json({ error: 'invalid_client_metadata' });
    }

    if (
      body.response_types !== undefined &&
      (!Array.isArray(body.response_types) ||
        body.response_types.some((value) => typeof value !== 'string'))
    ) {
      return res.status(400).json({ error: 'invalid_client_metadata' });
    }
    const responseTypes =
      body.response_types === undefined ? ['code'] : (body.response_types as string[]);
    if (responseTypes.length === 0 || responseTypes.some((type) => type !== 'code')) {
      return res.status(400).json({ error: 'invalid_client_metadata' });
    }

    try {
      const registered = await store.registerDynamicClient({
        clientName:
          typeof body.client_name === 'string' && body.client_name.trim()
            ? body.client_name.trim().slice(0, 200)
            : 'Dynamic MCP client',
        redirectUris,
        tokenEndpointAuthMethod: authMethod,
        applicationType: applicationType as 'native' | 'web' | undefined,
      });
      const now = Math.floor(Date.now() / 1000);
      return res
        .status(201)
        .set('Cache-Control', 'no-store')
        .json({
          client_id: registered.client.clientId,
          ...(registered.clientSecret
            ? { client_secret: registered.clientSecret, client_secret_expires_at: 0 }
            : {}),
          client_id_issued_at: now,
          client_name: registered.client.clientName,
          redirect_uris: registered.client.redirectUris,
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: registered.client.tokenEndpointAuthMethod,
          ...(registered.client.applicationType
            ? { application_type: registered.client.applicationType }
            : {}),
        });
    } catch (error) {
      if ((error as Error).message === 'dynamic_client_limit_reached') {
        return rateLimited(res, 'too_many_clients');
      }
      throw error;
    }
  });

  app.get('/oauth/authorize', async (req, res) => {
    if (!cfg.MCP_OAUTH_OWNER_SECRET) return unavailable(req, res);
    const q = req.query;
    const clientId = typeof q.client_id === 'string' ? q.client_id : '';
    const redirectUri = typeof q.redirect_uri === 'string' ? q.redirect_uri : '';
    const requestedResource = typeof q.resource === 'string' ? q.resource : undefined;
    const state = typeof q.state === 'string' ? q.state : '';
    const client = await resolveClient(clientId);

    const headers = res.set(oauthPageHeaders);
    if (!client)
      return headers
        .status(400)
        .type('html')
        .send(
          renderOAuthErrorPage({
            title: 'Invalid client',
            message: 'This OAuth client is not registered with JamRelay.',
          }),
        );
    if (!client.redirectUris.includes(redirectUri))
      return headers
        .status(400)
        .type('html')
        .send(
          renderOAuthErrorPage({
            title: 'Invalid redirect URI',
            message: 'The callback registered for this client does not match this request.',
          }),
        );
    if (
      q.response_type !== 'code' ||
      !q.code_challenge ||
      q.code_challenge_method !== 'S256' ||
      !validResource(requestedResource) ||
      (q.state !== undefined && typeof q.state !== 'string')
    ) {
      return headers
        .status(400)
        .type('html')
        .send(
          renderOAuthErrorPage({
            title: 'Invalid OAuth request',
            message:
              'The authorization request is missing required security parameters or is not supported.',
          }),
        );
    }

    const fields = {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      code_challenge: String(q.code_challenge),
      code_challenge_method: 'S256',
      state,
      resource: requestedResource ?? resource,
    };
    const permissionOptions = [
      'catalog.read',
      'library.read',
      'library.write',
      'playlist.read',
      'playlist.write',
      'playlist.destructive',
      'playback.read',
      'playback.control',
      'personalization.read',
      'transfer.plan',
      'transfer.execute',
      'diagnostics.read',
    ];

    return headers.type('html').send(
      renderAuthorizePage({
        clientName: client.clientName,
        fields,
        permissions: permissionOptions,
        connections: connectionOptions(),
      }),
    );
  });

  app.post('/oauth/authorize', express.urlencoded({ extended: false }), async (req, res) => {
    if (!cfg.MCP_OAUTH_OWNER_SECRET) return unavailable(req, res);
    if (!allowed(req)) return rateLimited(res, 'rate_limited');

    const body = (req.body ?? {}) as any;
    const client = await resolveClient(body.client_id ?? '');
    const requestedResource = body.resource || resource;
    const headers = res.set(oauthPageHeaders).type('html');
    if (!client)
      return headers.status(400).send(
        renderOAuthErrorPage({
          title: 'Invalid client',
          message: 'This OAuth client is not registered with JamRelay.',
        }),
      );
    if (!client.redirectUris.includes(body.redirect_uri ?? ''))
      return headers.status(400).send(
        renderOAuthErrorPage({
          title: 'Invalid redirect URI',
          message: 'The callback registered for this client does not match this request.',
        }),
      );
    const validRequest =
      body.response_type === 'code' &&
      body.code_challenge_method === 'S256' &&
      Boolean(body.code_challenge) &&
      validResource(requestedResource) &&
      typeof body.state === 'string';
    if (!validRequest)
      return headers.status(400).send(
        renderOAuthErrorPage({
          title: 'Invalid OAuth request',
          message:
            'The authorization request could not be validated. Start the connection again from ChatGPT.',
        }),
      );
    if (body.decision === 'cancel') {
      const redirect = new URL(body.redirect_uri);
      redirect.searchParams.set('error', 'access_denied');
      redirect.searchParams.set('iss', origin);
      if (body.state) redirect.searchParams.set('state', body.state);
      return res.redirect(302, redirect.toString());
    }
    if (!same(body.owner_secret ?? '', cfg.MCP_OAUTH_OWNER_SECRET))
      return headers.status(401).send(
        renderOAuthErrorPage({
          title: 'Invalid owner secret',
          message: 'The owner secret did not match. Check it and try again.',
        }),
      );

    const availableConnections = new Set(connectionOptions().map((connection) => connection.id));
    const availablePermissions = new Set([
      'catalog.read',
      'library.read',
      'library.write',
      'playlist.read',
      'playlist.write',
      'playlist.destructive',
      'playback.read',
      'playback.control',
      'personalization.read',
      'transfer.plan',
      'transfer.execute',
      'diagnostics.read',
    ]);
    const connectionIds = ([] as string[])
      .concat(body.connection_ids ?? [])
      .filter((value) => Boolean(value) && availableConnections.has(value));
    const permissions = ([] as string[])
      .concat(body.permissions ?? [])
      .filter((value) => Boolean(value) && availablePermissions.has(value));
    await store.setGrant(client.clientId, connectionIds, permissions);

    if (client.source === 'dynamic') await store.touchDynamicClient(client.clientId, true);
    const code = await store.issueCode({
      clientId: client.clientId,
      redirectUri: body.redirect_uri!,
      challenge: body.code_challenge!,
      resource: requestedResource,
    });
    const redirect = new URL(body.redirect_uri!);
    redirect.searchParams.set('code', code);
    redirect.searchParams.set('iss', origin);
    if (body.state !== undefined) redirect.searchParams.set('state', body.state);
    return res.redirect(302, redirect.toString());
  });

  app.post('/oauth/token', express.urlencoded({ extended: false }), async (req, res) => {
    if (!cfg.MCP_OAUTH_OWNER_SECRET) return unavailable(req, res);
    if (!allowed(req)) return rateLimited(res, 'slow_down');

    const body = (req.body ?? {}) as Record<string, string>;
    const basic = readBasicClient(req.header('authorization'));
    if (basic.present && !basic.valid) {
      return res
        .status(401)
        .set('WWW-Authenticate', 'Basic realm="oauth/token"')
        .set('Cache-Control', 'no-store')
        .json({ error: 'invalid_client' });
    }
    const method: TokenEndpointAuthMethod = basic.present
      ? 'client_secret_basic'
      : body.client_secret
        ? 'client_secret_post'
        : 'none';
    const clientId = basic.present ? basic.clientId : (body.client_id ?? '');
    const secret = basic.present ? basic.secret : body.client_secret;
    const client = await resolveClient(clientId);

    if (!client || !authenticateClient(client, method, secret)) {
      return res
        .status(401)
        .set('WWW-Authenticate', 'Basic realm="oauth/token"')
        .set('Cache-Control', 'no-store')
        .json({ error: 'invalid_client' });
    }

    if (client.source === 'dynamic') await store.touchDynamicClient(client.clientId);
    const requestedResource = body.resource || resource;
    if (!validResource(requestedResource)) {
      return res.status(400).json({ error: 'invalid_target' });
    }

    const sendTokens = (result: { access: string; refresh: string }) =>
      res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache').json({
        access_token: result.access,
        refresh_token: result.refresh,
        token_type: 'Bearer',
        expires_in: 3600,
      });

    if (body.grant_type === 'refresh_token') {
      const result = await store.useRefresh(body.refresh_token ?? '', client.clientId, resource);
      if (!result) return res.status(400).json({ error: 'invalid_grant' });
      return sendTokens(result);
    }

    if (
      body.grant_type !== 'authorization_code' ||
      !body.code ||
      !body.redirect_uri ||
      !client.redirectUris.includes(body.redirect_uri) ||
      !body.code_verifier
    ) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    if (
      !(await store.exchangeCode(
        body.code,
        client.clientId,
        body.redirect_uri,
        body.code_verifier,
        resource,
      ))
    ) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    return sendTokens(await store.issueTokens(client.clientId, resource));
  });
}
