import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import pino, { type Logger } from 'pino';
import { getConfig, type Config } from './config.js';
import { TokenStore } from './spotify/token-store.js';
import { SpotifyAuth } from './spotify/auth.js';
import { SpotifyClient } from './spotify/client.js';
import { registerTools } from './mcp/tools.js';
import { McpOAuthStore, registerMcpOAuthRoutes } from './mcp/oauth.js';
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
  app.use(express.json({ limit: '64kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  const oauthStore = new McpOAuthStore(cfg.MCP_OAUTH_STORE_PATH);
  registerMcpOAuthRoutes(app, cfg, oauthStore);
  app.get('/health', async (_req, res) =>
    res.json({
      status: 'ok',
      spotifyConnected: await auth.connected(),
      version: '1.0.0',
      mcpEndpoint: cfg.PUBLIC_BASE_URL + '/mcp',
    }),
  );
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
      const server = new McpServer({ name: 'tunelink', version: '1.0.0' });
      registerTools(server, client);
      return server;
    },
    { legacy: 'stateless' },
  );
  const nodeMcpHandler = toNodeHandler(mcpHandler);
  app.all('/mcp', async (req, res) => {
    if (!(await authorized(req)))
      return res
        .status(401)
        .set(
          'WWW-Authenticate',
          `Bearer resource_metadata="${cfg.PUBLIC_BASE_URL.replace(/\/$/, '')}/.well-known/oauth-protected-resource"`,
        )
        .json({ error: 'Unauthorized' });
    const started = Date.now();
    res.on('finish', () =>
      logger.info(
        {
          event: 'mcp_request',
          method: req.method,
          path: '/mcp',
          status: res.statusCode,
          latency_ms: Date.now() - started,
        },
        'MCP request',
      ),
    );
    void nodeMcpHandler(req, res, req.body);
  });
  return app;
}
export function startServer(cfg = getConfig()) {
  const app = createApp(cfg);
  return app.listen(cfg.PORT, cfg.HOST, () =>
    pino().info({ event: 'startup', host: cfg.HOST, port: cfg.PORT }, 'Spotify MCP server started'),
  );
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) startServer();
