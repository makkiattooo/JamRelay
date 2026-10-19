import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { runtimePath } from './runtime/installation.js';
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
import {
  registerOwnerAuthentication,
  ProviderInitiations,
  providerConsentPage,
  authResultPage,
  secretMatches,
} from './mcp/provider-authorization.js';
import { apiErrorHandler, requestId, sendApiError, ApiError, toApiError } from './http/errors.js';
import { toolContext } from './mcp/context.js';
import { recoverInterruptedJobs } from './db/jobs.js';
import { JobRunner, providerJobResolver } from './db/job-runner.js';
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
  initializeDatabase,
  closeDatabase,
  getDatabaseStatus,
  isDatabaseInitialized,
} from './db/database.js';
import { beginDraining, waitForOperations } from './runtime/lifecycle.js';
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
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use('/assets', express.static(runtimePath('assets'), { index: false }));
  const oauthStore = new McpOAuthStore(cfg.MCP_OAUTH_STORE_PATH);
  registerMcpOAuthRoutes(app, cfg, oauthStore, () =>
    registry.listConnections().map((x) => ({
      id: x.connectionId,
      provider: x.provider,
      name: x.displayName ?? x.connectionId,
    })),
  );
  const { owner, csrf, allowed } = registerOwnerAuthentication(
    app,
    cfg.MCP_OAUTH_OWNER_SECRET ?? '',
    cfg.PUBLIC_BASE_URL,
  );
  const initiations = new ProviderInitiations();
  app.get('/health', async (_req, res) => {
    const database = getDatabaseStatus();
    res.status(database.ready ? 200 : 503).json({
      status: database.ready ? 'ok' : 'error',
      version: APP_VERSION,
      database: {
        status: database.ready ? 'ok' : 'error',
        schemaVersion: database.currentVersion,
        expectedVersion: database.expectedVersion,
        schemaState: database.schemaState,
      },
    });
  });
  const providerStart = (req: express.Request, res: express.Response) => {
    const session = owner(req);
    if (!session) return res.status(401).json({ error: 'OWNER_AUTH_REQUIRED' });
    const provider = String(req.params.provider ?? 'spotify').toLowerCase();
    const authFlow =
      provider === 'spotify'
        ? auth
        : provider === 'soundcloud'
          ? soundCloudAuth
          : provider === 'youtube'
            ? youtubeAuth
            : undefined;
    if (!authFlow) return sendApiError(res, providerNotConfigured());
    const connection = `${provider}-default`;
    if (req.method === 'GET')
      return res
        .type('html')
        .set(oauthPageHeaders)
        .send(providerConsentPage(provider, connection, session.csrf));
    if (!csrf(req) || req.body?.connection_id !== connection)
      return res.status(403).json({ error: 'CSRF_OR_CONNECTION_INVALID' });
    if (!allowed(req))
      return res.status(429).set('Retry-After', '300').json({ error: 'RATE_LIMITED' });
    const flow = authFlow.loginUrl();
    initiations.approve(flow.state, provider, connection, session.token);
    return res.set(oauthPageHeaders).redirect(flow.url);
  };
  app.get('/auth/providers/:provider/start', providerStart);
  app.post('/auth/providers/:provider/start', providerStart);
  app.get('/auth/spotify/login', providerStart);
  app.post('/auth/spotify/login', providerStart);
  const providerCallback = async (req: express.Request, res: express.Response) => {
    const provider = String(req.params.provider ?? 'spotify').toLowerCase();
    if (!['spotify', 'soundcloud', 'youtube'].includes(provider))
      return res.status(404).json({ error: 'PROVIDER_AUTH_UNSUPPORTED' });
    let initiationConsumed = false;
    try {
      const session = owner(req);
      if (!session) throw new Error('OWNER_AUTH_REQUIRED');
      initiations.consume(
        String(req.query.state ?? ''),
        provider,
        `${provider}-default`,
        session.token,
      );
      initiationConsumed = true;
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
            'The provider authorization was completed. You can close this window.',
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
    } finally {
      if (initiationConsumed) initiations.finish(`${provider}-default`);
    }
  };
  app.get('/auth/providers/:provider/callback', providerCallback);
  app.get('/auth/spotify/callback', providerCallback);
  app.post('/auth/apple-music/user-token', express.json({ limit: '16kb' }), async (req, res) => {
    const supplied = req.header('x-jamrelay-owner-secret') || '';
    if (!allowed(req))
      return res.status(429).set('Retry-After', '300').json({ error: 'RATE_LIMITED' });
    if (!secretMatches(supplied, cfg.MCP_OAUTH_OWNER_SECRET ?? ''))
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
    providerJobResolver(
      (app as typeof app & { jamrelayRegistry: ProviderRegistry }).jamrelayRegistry,
      new TrackResolver((app as typeof app & { jamrelayClient: SpotifyClient }).jamrelayClient),
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
    const stopped = jobRunner.stop();
    logger.info({ event: 'shutdown', signal }, `${APP_NAME} shutdown requested`);
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      void Promise.all([stopped, waitForOperations()])
        .then(() => closeDatabase())
        .catch(() =>
          logger.error(
            { event: 'shutdown.persistence_active' },
            'SQLite kept open because shutdown failed',
          ),
        );
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
