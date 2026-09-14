import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import pino, { type Logger } from 'pino';
import { APP_NAME, getConfig, type Config } from './config.js';
import { SpotifyAuth } from './spotify/auth.js';
import { SpotifyClient } from './spotify/client.js';
import { SpotifyProviderAdapter } from './spotify/provider-adapter.js';
import { ProviderRegistry } from './providers/registry.js';
import { providerNotConfigured } from './http/errors.js';
import { APP_VERSION } from './version.js';
import { registerTools } from './mcp/tools.js';
import { McpOAuthStore, registerMcpOAuthRoutes } from './mcp/oauth.js';
import { oauthPageHeaders } from './mcp/oauth-authorize-page.js';
import { OwnerSessionStore } from './mcp/owner-session.js';
import { apiErrorHandler, requestId, sendApiError, ApiError } from './http/errors.js';
import { toolContext } from './mcp/context.js';
import { recoverInterruptedJobs } from './db/jobs.js';
import { JobRunner } from './db/job-runner.js';
import { TrackResolver } from './spotify/resolver.js';
import {
  ConnectionCredentialStore,
  EncryptedCredentialStore,
} from './providers/credential-store.js';
import { SoundCloudAuth } from './soundcloud/auth.js';
import { SoundCloudProviderAdapter } from './soundcloud/provider-adapter.js';
import { AppleMusicAuth } from './apple-music/auth.js';
import { AppleMusicProviderAdapter } from './apple-music/provider-adapter.js';
import { YouTubeAuth } from './youtube/auth.js';
import { YouTubeProviderAdapter } from './youtube/provider-adapter.js';
import {
  adminLoginPage,
  authResultPage,
  connectionDetailPage,
  connectionsPage,
  dashboardPage,
  providerChooserPage,
  escapeHtml,
  page,
} from './web/ui.js';
import {
  closeDatabase,
  getDatabaseStatus,
  initializeDatabase,
  isDatabaseInitialized,
} from './db/database.js';
export type AppDependencies = {
  auth?: SpotifyAuth;
  client?: SpotifyClient;
  soundCloudAuth?: SoundCloudAuth;
  appleMusicAuth?: AppleMusicAuth;
  youtubeAuth?: YouTubeAuth;
  registry?: ProviderRegistry;
  logger: Logger;
};
export function createApp(cfg: Config, provided?: Partial<AppDependencies>) {
  const logger =
    provided?.logger ??
    pino({
      level: cfg.LOG_LEVEL,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'SPOTIFY_CLIENT_SECRET',
        'SPOTIFY_CLIENT_ID',
        'ALTERNATE_TRACK_RESOLVER_TOKEN',
        'PROVIDER_CREDENTIAL_STORE_PATH',
        'providerCredentials',
        'credentials',
        'accessToken',
        'refreshToken',
        'clientSecret',
        'MCP_API_KEY',
      ],
    });
  const spotifyConfigured = Boolean(
    cfg.SPOTIFY_CLIENT_ID && cfg.SPOTIFY_CLIENT_SECRET && cfg.SPOTIFY_REDIRECT_URI,
  );
  const auth =
    provided?.auth ??
    (spotifyConfigured
      ? new SpotifyAuth(
          {
            SPOTIFY_CLIENT_ID: cfg.SPOTIFY_CLIENT_ID!,
            SPOTIFY_CLIENT_SECRET: cfg.SPOTIFY_CLIENT_SECRET!,
            SPOTIFY_REDIRECT_URI: cfg.SPOTIFY_REDIRECT_URI!,
          },
          new ConnectionCredentialStore(
            new EncryptedCredentialStore(
              cfg.PROVIDER_CREDENTIAL_STORE_PATH,
              cfg.TOKEN_ENCRYPTION_KEY,
            ),
            'spotify-default',
          ),
        )
      : undefined);
  const soundCloudConfigured = Boolean(
    cfg.SOUNDCLOUD_CLIENT_ID && cfg.SOUNDCLOUD_CLIENT_SECRET && cfg.SOUNDCLOUD_REDIRECT_URI,
  );
  const soundCloudAuth =
    provided?.soundCloudAuth ??
    (soundCloudConfigured
      ? new SoundCloudAuth(
          {
            SOUNDCLOUD_CLIENT_ID: cfg.SOUNDCLOUD_CLIENT_ID!,
            SOUNDCLOUD_CLIENT_SECRET: cfg.SOUNDCLOUD_CLIENT_SECRET!,
            SOUNDCLOUD_REDIRECT_URI: cfg.SOUNDCLOUD_REDIRECT_URI!,
          },
          new EncryptedCredentialStore(cfg.PROVIDER_CREDENTIAL_STORE_PATH),
        )
      : undefined);
  const appleMusicConfigured = Boolean(
    cfg.APPLE_MUSIC_TEAM_ID && cfg.APPLE_MUSIC_KEY_ID && cfg.APPLE_MUSIC_PRIVATE_KEY_PATH,
  );
  const appleMusicAuth =
    provided?.appleMusicAuth ??
    (appleMusicConfigured
      ? new AppleMusicAuth(
          { teamId: cfg.APPLE_MUSIC_TEAM_ID!, keyId: cfg.APPLE_MUSIC_KEY_ID!, privateKey: '' },
          cfg.APPLE_MUSIC_PRIVATE_KEY_PATH!,
          new EncryptedCredentialStore(cfg.PROVIDER_CREDENTIAL_STORE_PATH),
        )
      : undefined);
  const youtubeConfigured = Boolean(
    cfg.YOUTUBE_CLIENT_ID && cfg.YOUTUBE_CLIENT_SECRET && cfg.YOUTUBE_REDIRECT_URI,
  );
  const youtubeAuth =
    provided?.youtubeAuth ??
    (youtubeConfigured
      ? new YouTubeAuth(
          {
            clientId: cfg.YOUTUBE_CLIENT_ID!,
            clientSecret: cfg.YOUTUBE_CLIENT_SECRET!,
            redirectUri: cfg.YOUTUBE_REDIRECT_URI!,
          },
          new EncryptedCredentialStore(cfg.PROVIDER_CREDENTIAL_STORE_PATH),
        )
      : undefined);
  const client =
    provided?.client ?? (auth ? new SpotifyClient(auth, cfg.SPOTIFY_MARKET, logger) : undefined);
  const registry = provided?.registry ?? new ProviderRegistry();
  if (auth && client) registry.register(new SpotifyProviderAdapter(auth, client));
  if (soundCloudAuth) registry.register(new SoundCloudProviderAdapter(soundCloudAuth));
  const appleMusicAdapter = appleMusicAuth
    ? new AppleMusicProviderAdapter(appleMusicAuth, { storefront: cfg.APPLE_MUSIC_STOREFRONT })
    : undefined;
  if (appleMusicAdapter) {
    void appleMusicAdapter.refreshCapabilities();
    registry.register(appleMusicAdapter);
  }
  if (youtubeAuth) registry.register(new YouTubeProviderAdapter(youtubeAuth));
  const safeClient =
    client ??
    ({
      request: async () => Promise.reject(providerNotConfigured()),
      json: async () => Promise.reject(providerNotConfigured()),
    } as unknown as SpotifyClient);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.TRUST_PROXY === 'true');
  app.use(requestId);
  app.use(express.json({ limit: '2mb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use('/assets', express.static(resolve(process.cwd(), 'assets'), { index: false }));
  const oauthStore = new McpOAuthStore(cfg.MCP_OAUTH_STORE_PATH);
  registerMcpOAuthRoutes(app, cfg, oauthStore, () =>
    registry.listConnections().map((x) => ({
      id: x.connectionId,
      provider: x.provider,
      name: x.displayName ?? x.connectionId,
    })),
  );
  const ownerSessions = new OwnerSessionStore();
  const cookie = (req: express.Request, name: string) => {
    const match = (req.header('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return match?.[1];
  };
  const owner = (req: express.Request) => ownerSessions.get(cookie(req, 'jamrelay_owner'));
  const csrf = (req: express.Request) => {
    const session = owner(req);
    return session && req.header('x-csrf-token') === session.csrf;
  };
  app.get('/owner/login', (_req, res) =>
    res.type('html').set(oauthPageHeaders).send(adminLoginPage()),
  );
  app.post('/owner/login', express.urlencoded({ extended: false }), (req, res) => {
    const session = ownerSessions.authenticate(
      String(req.body?.owner_secret ?? ''),
      cfg.MCP_OAUTH_OWNER_SECRET ?? '',
    );
    if (!session)
      return res
        .status(401)
        .type('html')
        .set(oauthPageHeaders)
        .send(adminLoginPage('The owner secret was not accepted. Try again.'));
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return res
      .setHeader(
        'Set-Cookie',
        `jamrelay_owner=${session.token}; HttpOnly; SameSite=Lax; Max-Age=1800${secure}`,
      )
      .redirect('/connections');
  });
  app.get('/admin/login', (_req, res) =>
    res.type('html').set(oauthPageHeaders).send(adminLoginPage()),
  );
  app.post('/admin/login', express.urlencoded({ extended: false }), (req, res) => {
    const session = ownerSessions.authenticate(
      String(req.body?.owner_secret ?? ''),
      cfg.MCP_OAUTH_OWNER_SECRET ?? '',
    );
    if (!session)
      return res
        .status(401)
        .type('html')
        .set(oauthPageHeaders)
        .send(adminLoginPage('The owner secret was not accepted. Try again.'));
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return res
      .setHeader(
        'Set-Cookie',
        `jamrelay_owner=${session.token}; HttpOnly; SameSite=Lax; Max-Age=1800${secure}`,
      )
      .redirect('/admin');
  });
  app.get('/admin', async (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    const connections = await providerSummary();
    return res
      .type('html')
      .set(oauthPageHeaders)
      .send(
        dashboardPage({
          connections: connections.length,
          connected: connections.filter((x) => x.status === 'connected').length,
          clients: (await oauthStore.listGrants()).length,
          schema: getDatabaseStatus().schemaState,
        }),
      );
  });
  app.get('/admin/connections', async (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    return res
      .type('html')
      .set(oauthPageHeaders)
      .send(connectionsPage((await providerSummary()) as any, registry.getPreferred()));
  });
  app.get('/admin/connections/:connectionId', (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    const connection = registry.getConnection(req.params.connectionId);
    return connection
      ? res
          .type('html')
          .set(oauthPageHeaders)
          .send(connectionDetailPage(connection.summary, registry.getPreferred(), owner(req)!.csrf))
      : res
          .status(404)
          .type('html')
          .set(oauthPageHeaders)
          .send(authResultPage('', false, 'Connection not found.'));
  });
  app.post(
    '/admin/connections/:connectionId/disconnect',
    express.urlencoded({ extended: false }),
    (req, res) => {
      if (!owner(req) || (!csrf(req) && req.body?.csrf_token !== owner(req)?.csrf))
        return res
          .status(403)
          .type('html')
          .set(oauthPageHeaders)
          .send(authResultPage('', false, 'Your owner session or CSRF token is no longer valid.'));
      registry.unregister(req.params.connectionId);
      return res.redirect('/admin/connections');
    },
  );
  app.get('/admin/providers', (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    return res
      .type('html')
      .set(oauthPageHeaders)
      .send(
        providerChooserPage([
          { id: 'spotify', label: 'Spotify', configured: Boolean(auth) },
          { id: 'soundcloud', label: 'SoundCloud', configured: Boolean(soundCloudAuth) },
          { id: 'youtube', label: 'YouTube', configured: Boolean(youtubeAuth) },
          { id: 'apple-music', label: 'Apple Music', configured: Boolean(appleMusicAuth) },
        ]),
      );
  });
  app.get('/admin/clients', async (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    const grants = await oauthStore.listGrants();
    return res
      .type('html')
      .set(oauthPageHeaders)
      .send(
        page(
          'Authorized clients',
          `<div class="eyebrow">Access management</div><h1>Authorized MCP clients</h1><p class="lede">MCP OAuth grants are separate from owner authentication and provider connections.</p><div class="list">${grants.length ? grants.map((g) => `<article class="card"><h2>${escapeHtml(g.clientId)}</h2><p class="muted">${g.connectionIds.length} connection(s) · ${g.permissions.length} permission(s)</p><a class="button" href="/owner/grants">View grant data</a></article>`).join('') : '<div class="empty">No MCP clients have been authorized.</div>'}</div>`,
          'clients',
        ),
      );
  });
  app.get('/admin/status', async (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    const dbStatus = getDatabaseStatus();
    return res
      .type('html')
      .set(oauthPageHeaders)
      .send(
        page(
          'System status',
          `<div class="eyebrow">Owner-only diagnostics</div><h1>System status</h1><div class="grid"><div class="card"><div class="label">Version</div><div class="value">${escapeHtml(APP_VERSION)}</div></div><div class="card"><div class="label">Database</div><div class="value">${escapeHtml(dbStatus.schemaState)}</div><p class="muted">${escapeHtml(dbStatus.currentVersion || 'not initialized')}</p></div><div class="card"><div class="label">MCP auth mode</div><div class="value">${escapeHtml(cfg.MCP_AUTH_MODE)}</div></div></div><p class="muted">Secrets, tokens, encryption keys and raw provider responses are never displayed here.</p>`,
          'status',
        ),
      );
  });
  app.post('/owner/logout', (req, res) => {
    ownerSessions.revoke(cookie(req, 'jamrelay_owner'));
    return res
      .setHeader('Set-Cookie', 'jamrelay_owner=; HttpOnly; SameSite=Lax; Max-Age=0')
      .status(204)
      .end();
  });
  app.post('/owner/session/rotate', (req, res) => {
    const current = owner(req);
    if (!current || req.header('x-csrf-token') !== current.csrf)
      return res.status(403).json({ error: 'CSRF_REQUIRED' });
    const session = ownerSessions.rotate(current.token);
    if (!session) return res.status(401).json({ error: 'OWNER_AUTH_REQUIRED' });
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return res
      .setHeader(
        'Set-Cookie',
        `jamrelay_owner=${session.token}; HttpOnly; SameSite=Lax; Max-Age=1800${secure}`,
      )
      .json({ csrf_token: session.csrf, expires_at: session.expiresAt });
  });
  app.get('/connections/ui', (req, res) => {
    if (!owner(req)) return res.redirect('/owner/login');
    return res.redirect('/admin/connections');
  });
  app.get('/connections', (req, res) => {
    if (!owner(req)) return res.redirect('/owner/login');
    return res.json({
      connections: registry.listConnections(),
      preferred: registry.getPreferred(),
    });
  });
  app.get('/connections/:connectionId', (req, res) => {
    if (!owner(req)) return res.status(401).json({ error: 'OWNER_AUTH_REQUIRED' });
    const connection = registry.getConnection(req.params.connectionId);
    return connection
      ? res.json({ ...connection.summary, preferred: registry.getPreferred() })
      : res.status(404).json({ error: 'CONNECTION_NOT_FOUND' });
  });
  app.patch('/connections/:connectionId', express.json({ limit: '16kb' }), (req, res) => {
    if (!owner(req) || !csrf(req)) return res.status(403).json({ error: 'CSRF_REQUIRED' });
    const connection = registry.getConnection(req.params.connectionId);
    if (!connection) return res.status(404).json({ error: 'CONNECTION_NOT_FOUND' });
    if (typeof req.body?.display_name === 'string')
      connection.summary.displayName = req.body.display_name.slice(0, 120);
    if (req.body?.preferred_read === true) registry.setPreferredRead(req.params.connectionId);
    if (req.body?.preferred_write === true) registry.setPreferredWrite(req.params.connectionId);
    return res.json({ ...connection.summary, preferred: registry.getPreferred() });
  });
  app.delete('/connections/:connectionId', (req, res) => {
    if (!owner(req) || !csrf(req)) return res.status(403).json({ error: 'CSRF_REQUIRED' });
    return res.json({
      disconnected: registry.unregister(req.params.connectionId),
      state_retained: true,
    });
  });
  app.get('/owner/grants', async (req, res) => {
    if (!owner(req)) return res.status(401).json({ error: 'OWNER_AUTH_REQUIRED' });
    return res.json({ grants: await oauthStore.listGrants() });
  });
  app.patch('/owner/grants/:clientId', express.json({ limit: '32kb' }), async (req, res) => {
    if (!owner(req) || !csrf(req)) return res.status(403).json({ error: 'CSRF_REQUIRED' });
    await oauthStore.updateGrant(
      req.params.clientId,
      Array.isArray(req.body?.connection_ids) ? req.body.connection_ids : [],
      Array.isArray(req.body?.permissions) ? req.body.permissions : [],
    );
    return res.json(await oauthStore.getGrant(req.params.clientId));
  });
  app.delete('/owner/grants/:clientId', async (req, res) => {
    if (!owner(req) || !csrf(req)) return res.status(403).json({ error: 'CSRF_REQUIRED' });
    return res.json({ revoked: await oauthStore.revokeGrant(req.params.clientId) });
  });
  const providerSummary = async () =>
    Promise.all(
      registry.listConnections().map(async (summary) => ({
        ...summary,
        status:
          summary.provider === 'spotify' && auth
            ? (await auth.connected())
              ? 'connected'
              : 'disconnected'
            : summary.provider === 'soundcloud' && soundCloudAuth
              ? (await soundCloudAuth.connected())
                ? 'connected'
                : 'disconnected'
              : summary.provider === 'apple-music' && appleMusicAuth
                ? (await appleMusicAuth.connected())
                  ? 'connected'
                  : 'configured'
                : summary.provider === 'youtube' && youtubeAuth
                  ? (await youtubeAuth.connected())
                    ? 'connected'
                    : 'disconnected'
                  : summary.connected === false
                    ? 'disconnected'
                    : 'configured',
      })),
    );
  app.get('/providers', async (_req, res) => res.json({ providers: await providerSummary() }));
  app.get('/providers/:provider/connections', async (req, res) =>
    res.json({
      providers: (await providerSummary()).filter((x) => x.provider === req.params.provider),
    }),
  );
  app.get('/health', async (_req, res) => {
    const database = getDatabaseStatus();
    const providers = await providerSummary();
    const spotifyConnected = providers.some(
      (x) => x.provider === 'spotify' && x.status === 'connected',
    );
    res.status(database.ready ? 200 : 503).json({
      status: database.ready ? 'ok' : 'error',
      providers,
      spotifyConnected,
      version: APP_VERSION,
      mcpEndpoint: cfg.PUBLIC_BASE_URL + '/mcp',
      database: {
        status: database.ready ? 'ok' : 'error',
        schemaVersion: database.currentVersion,
        expectedVersion: database.expectedVersion,
        schemaState: database.schemaState,
      },
    });
  });
  app.get('/auth/status', async (_req, res) =>
    res.json({
      providers: await providerSummary(),
      spotifyConnected: auth ? await auth.connected() : false,
      reauthorizationRequired: false,
    }),
  );
  app.get('/auth/providers/:provider/start', (req, res) => {
    const provider = req.params.provider.toLowerCase();
    if (!['spotify', 'soundcloud', 'youtube'].includes(provider))
      return res.status(404).json({ error: 'PROVIDER_AUTH_UNSUPPORTED' });
    const authFlow =
      provider === 'spotify' ? auth : provider === 'soundcloud' ? soundCloudAuth : youtubeAuth;
    if (!authFlow) return sendApiError(res, providerNotConfigured());
    return res.redirect(authFlow.loginUrl().url);
  });
  app.get('/auth/providers/:provider/callback', async (req, res) => {
    const provider = req.params.provider.toLowerCase();
    if (!['spotify', 'soundcloud', 'youtube'].includes(provider))
      return res.status(404).json({ error: 'PROVIDER_AUTH_UNSUPPORTED' });
    try {
      if (req.query.error) throw new Error(`${provider} authorization denied`);
      if (provider === 'spotify') {
        if (!auth) throw providerNotConfigured();
        auth.verifyState(String(req.query.state || ''));
        await auth.callback(String(req.query.code || ''));
      } else if (provider === 'soundcloud') {
        if (!soundCloudAuth) throw providerNotConfigured();
        const verifier = soundCloudAuth.verifyState(String(req.query.state || ''));
        await soundCloudAuth.callback(String(req.query.code || ''), verifier);
      } else {
        if (!youtubeAuth) throw providerNotConfigured();
        const verifier = youtubeAuth.verifyState(String(req.query.state || ''));
        await youtubeAuth.callback(String(req.query.code || ''), verifier);
      }
      return res
        .type('html')
        .set(oauthPageHeaders)
        .send(
          authResultPage(
            provider,
            true,
            'The provider authorization was completed. You can now manage this connection in the Connection Hub.',
            req.header('x-request-id'),
          ),
        );
    } catch (error) {
      if (error instanceof ApiError) return sendApiError(res, error);
      return res
        .status(400)
        .type('html')
        .set(oauthPageHeaders)
        .send(
          authResultPage(
            provider,
            false,
            'Authorization could not be completed. Check the provider configuration and try again.',
            req.header('x-request-id'),
          ),
        );
    }
  });
  app.post('/auth/apple-music/user-token', express.json({ limit: '16kb' }), async (req, res) => {
    const supplied = req.header('x-jamrelay-owner-secret') || '';
    if (!cfg.MCP_OAUTH_OWNER_SECRET || supplied !== cfg.MCP_OAUTH_OWNER_SECRET)
      return sendApiError(
        res,
        new ApiError(403, 'OWNER_AUTH_REQUIRED', 'Owner authentication is required.'),
      );
    if (!appleMusicAuth) return sendApiError(res, providerNotConfigured());
    try {
      await appleMusicAuth.setMusicUserToken(String(req.body?.music_user_token ?? ''));
      await appleMusicAdapter?.refreshCapabilities();
      return res.status(204).send();
    } catch (error) {
      return sendApiError(
        res,
        error instanceof ApiError
          ? error
          : new ApiError(400, 'APPLE_MUSIC_TOKEN_INVALID', 'Invalid Apple Music User Token.'),
      );
    }
  });
  const authorized = async (req: express.Request) => {
    const h = req.header('authorization') || '';
    if (!h.startsWith('Bearer ')) return false;
    const value = h.slice(7);
    const got = Buffer.from(value);
    const want = Buffer.from(cfg.MCP_API_KEY || '');
    if (
      cfg.MCP_AUTH_MODE === 'bearer' &&
      want.length > 0 &&
      got.length === want.length &&
      timingSafeEqual(got, want)
    )
      return {
        clientId: 'api-key',
        connectionIds: registry.listConnections().map((connection) => connection.connectionId),
        permissions: [
          'catalog.read',
          'library.read',
          'library.write',
          'playlist.read',
          'playlist.write',
          'playlist.destructive',
          'playback.control',
          'diagnostics.read',
          'transfer.plan',
          'transfer.execute',
        ],
      };
    return oauthStore.accessPolicy(value, `${cfg.PUBLIC_BASE_URL.replace(/\/$/, '')}/mcp`);
  };
  const mcpHandler = createMcpHandler(
    () => {
      const server = new McpServer({ name: 'jamrelay', version: APP_VERSION });
      registerTools(
        server,
        safeClient,
        logger,
        isDatabaseInitialized(),
        registry,
        cfg.JAMRELAY_TOOLSET,
      );
      return server;
    },
    { legacy: 'stateless' },
  );
  const nodeMcpHandler = toNodeHandler(mcpHandler);
  app.all('/mcp', async (req, res) => {
    const access = await authorized(req);
    if (!access)
      return sendApiError(
        res
          .status(401)
          .set(
            'WWW-Authenticate',
            `Bearer resource_metadata="${cfg.PUBLIC_BASE_URL.replace(/\/$/, '')}/.well-known/oauth-protected-resource"`,
          ),
        new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.'),
      );
    const started = Date.now();
    res.on('finish', () =>
      logger.info(
        {
          event: 'mcp_request',
          method: req.method,
          path: '/mcp',
          request_id: res.locals.requestId,
          status: res.statusCode,
          latency_ms: Date.now() - started,
        },
        'MCP request',
      ),
    );
    void toolContext.run(
      {
        requestId: res.locals.requestId,
        signal: new AbortController().signal,
        deadlineAt: Date.now() + 15000,
        mcpAccess: access,
      },
      () => nodeMcpHandler(req, res, req.body),
    );
  });
  app.use((_req, res) =>
    sendApiError(res, new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.')),
  );
  app.use(apiErrorHandler);
  (
    app as typeof app & { jamrelayClient: SpotifyClient; jamrelayRegistry: ProviderRegistry }
  ).jamrelayClient = safeClient;
  (
    app as typeof app & { jamrelayClient: SpotifyClient; jamrelayRegistry: ProviderRegistry }
  ).jamrelayRegistry = registry;
  return app;
}
export async function startServer(cfg = getConfig()) {
  const logger = pino({ level: cfg.LOG_LEVEL });
  initializeDatabase({
    dataDir: cfg.JAMRELAY_DATA_DIR,
    dbPath: cfg.JAMRELAY_DB_PATH,
    logger,
  });
  recoverInterruptedJobs();
  const app = createApp(cfg, { logger });
  const jobRunner = new JobRunner(
    Object.assign(
      new TrackResolver((app as typeof app & { jamrelayClient: SpotifyClient }).jamrelayClient),
      {
        hasConnection: (connectionId: string, provider?: string) =>
          Boolean(
            (app as typeof app & { jamrelayRegistry: ProviderRegistry }).jamrelayRegistry
              .selectConnections({ provider, capability: 'catalog' })
              .some((connection) => connection.summary.connectionId === connectionId),
          ),
      },
    ),
    logger,
  );
  jobRunner.start();
  const server = app.listen(cfg.PORT, cfg.HOST, () =>
    logger.info(
      { event: 'startup', host: cfg.HOST, port: cfg.PORT },
      'JamRelay MCP server started',
    ),
  );
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    void jobRunner.stop();
    logger.info({ event: 'shutdown', signal }, `${APP_NAME} shutdown requested`);
    server.close((error) => {
      if (error) logger.error({ err: error }, 'HTTP server shutdown failed');
      closeDatabase();
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return server;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  startServer().catch((error: unknown) => {
    pino().error({ err: error }, `${APP_NAME} startup failed`);
    process.exitCode = 1;
  });
