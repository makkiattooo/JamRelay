import { z } from 'zod';

const defaultDataPath = (file: string) =>
  process.env.NODE_ENV === 'production' ? `/data/${file}` : `./data/${file}`;

const dataPath = (file: string) =>
  z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().min(1).optional(),
    )
    .transform((value) => value ?? defaultDataPath(file));

const optionalNonEmpty = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

const schema = z.object({
  SPOTIFY_CLIENT_ID: z.string().min(1),
  SPOTIFY_CLIENT_SECRET: z.string().min(1),
  SPOTIFY_REDIRECT_URI: z.string().url(),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  SPOTIFY_TOKEN_STORE_PATH: dataPath('spotify-token.json'),
  TUNELINK_DATA_DIR: optionalNonEmpty,
  TUNELINK_DB_PATH: optionalNonEmpty,
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_BASE_URL: z.string().url(),
  LOG_LEVEL: z.string().default('info'),
  MCP_AUTH_MODE: z.enum(['none', 'bearer']).default('none'),
  MCP_API_KEY: optionalNonEmpty,

  // Legacy/pre-registered OAuth client. Kept for backwards compatibility and
  // for providers such as ChatGPT that give the operator a fixed callback URL.
  MCP_OAUTH_CLIENT_ID: optionalNonEmpty,
  MCP_OAUTH_CLIENT_SECRET: optionalNonEmpty,
  MCP_OAUTH_REDIRECT_URI: optionalUrl,

  // One owner approval secret protects every OAuth client registration type.
  MCP_OAUTH_OWNER_SECRET: optionalNonEmpty,
  MCP_OAUTH_STORE_PATH: dataPath('mcp-oauth.json'),

  // Optional static multi-client registry. A missing file is treated as an
  // empty registry so existing single-client deployments continue to work.
  MCP_OAUTH_CLIENTS_PATH: dataPath('mcp-oauth-clients.json'),

  // DCR is enabled by default when MCP OAuth itself is enabled. This lets
  // standards-compliant desktop/CLI clients register their loopback callback
  // automatically. Operators can set this to false and use only pre-registration.
  MCP_OAUTH_DCR_ENABLED: z.enum(['true', 'false']).default('true'),

  TRUST_PROXY: z.string().default('false'),
  SPOTIFY_MARKET: z.string().length(2).default('PL'),
});

export type Config = z.infer<typeof schema>;

export function getConfig(): Config {
  const c = schema.parse(process.env);

  if (c.MCP_AUTH_MODE === 'bearer' && !c.MCP_API_KEY) {
    throw new Error('MCP_API_KEY is required in bearer mode');
  }

  const legacyKeys = [
    'MCP_OAUTH_CLIENT_ID',
    'MCP_OAUTH_CLIENT_SECRET',
    'MCP_OAUTH_REDIRECT_URI',
  ] as const;
  const configuredLegacyValues = legacyKeys.filter((key) => Boolean(c[key]));

  if (configuredLegacyValues.length > 0 && configuredLegacyValues.length !== legacyKeys.length) {
    const missing = legacyKeys.filter((key) => !c[key]);
    throw new Error(
      `Incomplete legacy MCP OAuth client configuration. Missing: ${missing.join(', ')}`,
    );
  }

  if (configuredLegacyValues.length > 0 && !c.MCP_OAUTH_OWNER_SECRET) {
    throw new Error(
      'MCP_OAUTH_OWNER_SECRET is required when a legacy MCP OAuth client is configured',
    );
  }

  return c;
}
