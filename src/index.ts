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
import {
  registerTools,
  REQUIRED_TOOL_NAMES,
  SMART_PLAYLIST_TOOL_NAMES,
  toolsetIncludes,
} from './mcp/tools.js';
import { McpOAuthStore, registerMcpOAuthRoutes } from './mcp/oauth.js';
import { oauthPageHeaders } from './mcp/oauth-authorize-page.js';
import { OwnerSessionStore } from './mcp/owner-session.js';
import { apiErrorHandler, requestId, sendApiError, ApiError, toApiError } from './http/errors.js';
import { toolContext } from './mcp/context.js';
import { recoverInterruptedJobs } from './db/jobs.js';
import { JobRunner } from './db/job-runner.js';
import { TrackResolver } from './spotify/resolver.js';
import { Singleflight } from './utils/singleflight.js';
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
  adminConfirmationPage,
  adminPageHeaders,
  authResultPage,
  connectionDetailPage,
  connectionsPage,
  clientsPage,
  clientDetailPage,
  dashboardPage,
  providerChooserPage,
  systemStatusPage,
  adminListPage,
  adminJobDetailPage,
  adminErrorPage,
  escapeHtml,
  withAdminFlash,
} from './web/ui.js';
import {
  closeDatabase,
  getDatabaseStatus,
  initializeDatabase,
  isDatabaseInitialized,
} from './db/database.js';
import { getJob, listJobs, setJobStatus } from './db/jobs.js';
import { getRecentApiErrors } from './db/state.js';
import { listStateDiagnostics } from './db/jobs.js';
import { beginDraining } from './runtime/lifecycle.js';
import { getToolSecurityMetadata } from './mcp/tool-manifest.js';
import { createAdminRouter } from './web/admin-router.js';
import { registerAdminRoutes } from './web/admin-routes.js';
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
  const adminRouter = createAdminRouter();
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
  const sharedCredentialStore =
    cfg.TOKEN_ENCRYPTION_KEY && cfg.PROVIDER_CREDENTIAL_STORE_PATH
      ? new EncryptedCredentialStore(cfg.PROVIDER_CREDENTIAL_STORE_PATH, cfg.TOKEN_ENCRYPTION_KEY)
      : undefined;
  const credentialStore = () =>
    sharedCredentialStore ?? new EncryptedCredentialStore(cfg.PROVIDER_CREDENTIAL_STORE_PATH);
  const auth =
    provided?.auth ??
    (spotifyConfigured
      ? new SpotifyAuth(
          {
            SPOTIFY_CLIENT_ID: cfg.SPOTIFY_CLIENT_ID!,
            SPOTIFY_CLIENT_SECRET: cfg.SPOTIFY_CLIENT_SECRET!,
            SPOTIFY_REDIRECT_URI: cfg.SPOTIFY_REDIRECT_URI!,
          },
          new ConnectionCredentialStore(credentialStore(), 'spotify-default'),
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
          credentialStore(),
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
          credentialStore(),
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
          credentialStore(),
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
    void appleMusicAdapter.refreshCapabilities().catch(() => {
      logger.warn(
        { event: 'provider_capability_refresh_failed', provider: 'apple-music' },
        'Apple Music capability refresh failed; provider is degraded',
      );
    });
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
  const updateConnectionSettings = (connectionId: string, body: any) => {
    const connection = registry.getConnection(connectionId);
    if (!connection) return null;
    if (typeof body?.display_name === 'string')
      connection.summary.displayName = body.display_name.slice(0, 120);
    if (body?.preferred_read === true) registry.setPreferredRead(connectionId);
    if (body?.preferred_write === true) registry.setPreferredWrite(connectionId);
    return { ...connection.summary, preferred: registry.getPreferred() };
  };
  app.get('/owner/login', (_req, res) =>
    res.type('html').set(adminPageHeaders).send(adminLoginPage()),
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
        .set(adminPageHeaders)
        .send(adminLoginPage('The owner secret was not accepted. Try again.'));
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return res
      .setHeader(
        'Set-Cookie',
        `jamrelay_owner=${session.token}; HttpOnly; SameSite=Lax; Max-Age=1800${secure}`,
      )
      .redirect('/connections');
  });
  app.post('/owner/logout', express.urlencoded({ extended: false }), (req, res) => {
    const session = owner(req);
    if (!session)
      return res
        .status(401)
        .type('html')
        .set(adminPageHeaders)
        .send(authResultPage('', false, 'Your owner session is no longer valid.'));
    if (!csrf(req) && req.body?.csrf_token !== session.csrf)
      return res
        .status(403)
        .type('html')
        .set(adminPageHeaders)
        .send(
          adminConfirmationPage(
            'Sign out',
            'Confirm signing out of the owner session.',
            '/owner/logout',
            session.csrf,
          ),
        );
    ownerSessions.revoke(session.token);
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
    const updated = updateConnectionSettings(req.params.connectionId, req.body);
    return updated ? res.json(updated) : res.status(404).json({ error: 'CONNECTION_NOT_FOUND' });
  });
  app.delete('/connections/:connectionId', (req, res) => {
    if (!owner(req) || !csrf(req)) return res.status(403).json({ error: 'CSRF_REQUIRED' });
    return res.json({
      disconnected: registry.unregister(req.params.connectionId),
      state_retained: true,
    });
  });
  adminRouter.post(
    '/connections/:connectionId/settings',
    express.urlencoded({ extended: false }),
    (req, res) => {
      const session = owner(req);
      if (!session || req.body?.csrf_token !== session.csrf)
        return res
          .status(403)
          .type('html')
          .set(adminPageHeaders)
          .send(authResultPage('', false, 'Your owner session or CSRF token is no longer valid.'));
      if (!updateConnectionSettings(req.params.connectionId, req.body))
        return res
          .status(404)
          .type('html')
          .set(adminPageHeaders)
          .send(authResultPage('', false, 'Connection not found.'));
      ownerSessions.setFlash(session.token, 'Connection settings saved.');
      return res.redirect(`/admin/connections/${encodeURIComponent(req.params.connectionId)}`);
    },
  );
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
      registry.listConnections().map(async (summary) => {
        try {
          const connected =
            summary.provider === 'spotify' && auth
              ? await auth.connected()
              : summary.provider === 'soundcloud' && soundCloudAuth
                ? await soundCloudAuth.connected()
                : summary.provider === 'apple-music' && appleMusicAuth
                  ? await appleMusicAuth.connected()
                  : summary.provider === 'youtube' && youtubeAuth
                    ? await youtubeAuth.connected()
                    : summary.connected !== false;
          return {
            ...summary,
            status: connected
              ? 'connected'
              : summary.provider === 'apple-music'
                ? 'configured'
                : 'disconnected',
          };
        } catch {
          logger.warn(
            {
              event: 'provider_status_failed',
              provider: summary.provider,
              connection_id: summary.connectionId,
            },
            'Provider status check failed',
          );
          return { ...summary, status: 'degraded' };
        }
      }),
    );
  registerAdminRoutes(adminRouter, {
    ownerSessions,
    owner,
    csrf,
    cfg,
    registry,
    providerSummary,
    oauthStore,
    auth,
    soundCloudAuth,
    youtubeAuth,
    appleMusicAuth,
    appleMusicAdapter,
    updateConnectionSettings,
    backupOptions: {
      databasePath: cfg.JAMRELAY_DB_PATH ?? resolve(process.cwd(), 'data', 'jamrelay.db'),
      baseOutputDir: resolve(cfg.JAMRELAY_DATA_DIR ?? resolve(process.cwd(), 'data'), 'backups'),
      credentialFiles: [
        {
          name: 'provider-credentials.json',
          path:
            process.env.PROVIDER_CREDENTIAL_STORE_PATH ??
            resolve(
              cfg.JAMRELAY_DATA_DIR ?? resolve(process.cwd(), 'data'),
              'provider-credentials.json',
            ),
        },
        {
          name: 'mcp-oauth.json',
          path:
            process.env.MCP_OAUTH_STORE_PATH ??
            resolve(cfg.JAMRELAY_DATA_DIR ?? resolve(process.cwd(), 'data'), 'mcp-oauth.json'),
        },
        {
          name: 'mcp-oauth-clients.json',
          path:
            process.env.MCP_OAUTH_CLIENTS_PATH ??
            resolve(
              cfg.JAMRELAY_DATA_DIR ?? resolve(process.cwd(), 'data'),
              'mcp-oauth-clients.json',
            ),
        },
      ],
    },
  });
  app.use('/admin', adminRouter);
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
  const providerStart = (req: express.Request, res: express.Response) => {
    const provider = String(req.params.provider ?? 'spotify').toLowerCase();
    if (!['spotify', 'soundcloud', 'youtube'].includes(provider))
      return res.status(404).json({ error: 'PROVIDER_AUTH_UNSUPPORTED' });
    const authFlow =
      provider === 'spotify' ? auth : provider === 'soundcloud' ? soundCloudAuth : youtubeAuth;
    if (!authFlow) return sendApiError(res, providerNotConfigured());
    return res.redirect(authFlow.loginUrl().url);
  };
  app.get('/auth/providers/:provider/start', providerStart);
  app.get('/auth/spotify/login', providerStart);
  const providerCallback = async (req: express.Request, res: express.Response) => {
    const provider = String(req.params.provider ?? 'spotify').toLowerCase();
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
  };
  app.get('/auth/providers/:provider/callback', providerCallback);
  app.get('/auth/spotify/callback', providerCallback);
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
      const resolver = new TrackResolver(safeClient);
      registerTools(
        server,
        safeClient,
        logger,
        isDatabaseInitialized(),
        registry,
        cfg.JAMRELAY_TOOLSET,
        resolver,
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
    const requestController = new AbortController();
    const singleflight = new Singleflight();
    const abortOnDisconnect = () => {
      if (!res.writableEnded) requestController.abort();
    };
    req.on('aborted', abortOnDisconnect);
    res.on('close', abortOnDisconnect);
    try {
      await toolContext.run(
        {
          requestId: res.locals.requestId,
          signal: requestController.signal,
          // The tool wrapper applies the execution-class budget. This outer
          // deadline bounds the whole MCP exchange and is not reset by nesting.
          deadlineAt: Date.now() + 5 * 60_000,
          mcpAccess: access,
          singleflight,
        },
        () => nodeMcpHandler(req, res, req.body),
      );
    } catch (error) {
      if (!res.headersSent) return sendApiError(res, toApiError(error));
      logger.warn(
        { event: 'mcp_handler_error', request_id: res.locals.requestId },
        'MCP handler failed after response started',
      );
    } finally {
      req.off('aborted', abortOnDisconnect);
      res.off('close', abortOnDisconnect);
    }
  });
  app.use((req, res) => {
    if (req.path.startsWith('/admin') && req.accepts('html'))
      return res
        .status(404)
        .type('html')
        .set(adminPageHeaders)
        .send(
          adminErrorPage(
            404,
            'Page not found',
            'The requested admin page does not exist.',
            res.locals.requestId,
          ),
        );
    return sendApiError(res, new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.'));
  });
  app.use(
    (error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.path.startsWith('/admin') && req.accepts('html') && !res.headersSent) {
        const apiError = toApiError(error);
        return res
          .status(apiError.status)
          .type('html')
          .set(adminPageHeaders)
          .send(
            adminErrorPage(
              apiError.status,
              apiError.status === 403
                ? 'Access denied'
                : apiError.status === 409
                  ? 'Conflict'
                  : 'Request failed',
              apiError.message,
              res.locals.requestId,
            ),
          );
      }
      return apiErrorHandler(error, req, res, next);
    },
  );
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
    beginDraining();
    logger.info({ event: 'shutdown', signal }, `${APP_NAME} shutdown requested`);
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      void jobRunner.stop().finally(() => closeDatabase());
    };
    const graceTimer = setTimeout(() => {
      logger.warn({ event: 'shutdown.timeout', grace_ms: 10_000 }, 'Shutdown grace elapsed');
      server.closeAllConnections?.();
      finish();
    }, 10_000);
    server.close((error) => {
      if (error) logger.error({ err: error }, 'HTTP server shutdown failed');
      clearTimeout(graceTimer);
      finish();
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
