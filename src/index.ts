import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import pino, { type Logger } from 'pino';
import { APP_NAME, getConfig, type Config } from './config.js';
import { TokenStore } from './spotify/token-store.js';
import { SpotifyAuth } from './spotify/auth.js';
import { SpotifyClient } from './spotify/client.js';
import { registerTools } from './mcp/tools.js';
import { McpOAuthStore, registerMcpOAuthRoutes } from './mcp/oauth.js';
import { apiErrorHandler, requestId, sendApiError, ApiError } from './http/errors.js';
import { toolContext } from './mcp/context.js';
import { recoverInterruptedJobs } from './db/jobs.js';
import { JobRunner } from './db/job-runner.js';
import {
  closeDatabase,
  getDatabaseStatus,
  initializeDatabase,
  isDatabaseInitialized,
} from './db/database.js';
export type AppDependencies = { auth: SpotifyAuth; client: SpotifyClient; logger: Logger };
export function createApp(cfg: Config, provided?: Partial<AppDependencies>) {
  const logger =
    provided?.logger ??
    pino({
      level: cfg.LOG_LEVEL,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'SPOTIFY_CLIENT_SECRET',
        'MCP_API_KEY',
      ],
    });
  const auth =
    provided?.auth ??
    new SpotifyAuth(cfg, new TokenStore(cfg.SPOTIFY_TOKEN_STORE_PATH, cfg.TOKEN_ENCRYPTION_KEY));
  const client = provided?.client ?? new SpotifyClient(auth, cfg.SPOTIFY_MARKET, logger);
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
  const oauthStore = new McpOAuthStore(cfg.MCP_OAUTH_STORE_PATH);
  registerMcpOAuthRoutes(app, cfg, oauthStore);
  app.get('/health', async (_req, res) => {
    const database = getDatabaseStatus();
    const spotifyConnected = await auth.connected();
    res.status(database.ready ? 200 : 503).json({
      status: database.ready ? 'ok' : 'error',
      spotifyConnected,
      version: '1.0.0',
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
    res.json({ spotifyConnected: await auth.connected(), reauthorizationRequired: false }),
  );
  app.get('/auth/spotify/login', (_req, res) => res.redirect(auth.loginUrl().url));
  app.get('/auth/spotify/callback', async (req, res) => {
    try {
      if (req.query.error) throw new Error('Spotify authorization denied');
      auth.verifyState(String(req.query.state || ''));
      await auth.callback(String(req.query.code || ''));
      res
        .type('html')
        .send(
          '<!doctype html><title>Spotify connected</title><p>Spotify connected. You can close this window.</p>',
        );
    } catch {
      res
        .status(400)
        .type('html')
        .send(
          '<!doctype html><title>Spotify authorization failed</title><p>Authorization failed. Start again from /auth/spotify/login.</p>',
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
      return true;
    return oauthStore.validAccess(value, `${cfg.PUBLIC_BASE_URL.replace(/\/$/, '')}/mcp`);
  };
  const mcpHandler = createMcpHandler(
    () => {
      const server = new McpServer({ name: 'jamrelay', version: '1.0.0' });
      registerTools(server, client, logger, isDatabaseInitialized());
      return server;
    },
    { legacy: 'stateless' },
  );
  const nodeMcpHandler = toNodeHandler(mcpHandler);
  app.all('/mcp', async (req, res) => {
    if (!(await authorized(req)))
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
      },
      () => nodeMcpHandler(req, res, req.body),
    );
  });
  app.use((_req, res) =>
    sendApiError(res, new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.')),
  );
  app.use(apiErrorHandler);
  (app as typeof app & { jamrelayClient: SpotifyClient }).jamrelayClient = client;
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
    (app as typeof app & { jamrelayClient: SpotifyClient }).jamrelayClient,
    logger,
  );
  jobRunner.start();
  const server = app.listen(cfg.PORT, cfg.HOST, () =>
    logger.info({ event: 'startup', host: cfg.HOST, port: cfg.PORT }, 'Spotify MCP server started'),
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
