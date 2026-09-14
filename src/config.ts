import { z } from 'zod';

export const APP_NAME = 'JamRelay';
export const DEFAULT_PORT = 5267;

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
  SPOTIFY_CLIENT_ID: optionalNonEmpty,
  SPOTIFY_CLIENT_SECRET: optionalNonEmpty,
  SPOTIFY_REDIRECT_URI: optionalUrl,
  SOUNDCLOUD_CLIENT_ID: optionalNonEmpty,
  SOUNDCLOUD_CLIENT_SECRET: optionalNonEmpty,
  SOUNDCLOUD_REDIRECT_URI: optionalUrl,
  APPLE_MUSIC_TEAM_ID: optionalNonEmpty,
  APPLE_MUSIC_KEY_ID: optionalNonEmpty,
  APPLE_MUSIC_PRIVATE_KEY_PATH: optionalNonEmpty,
  APPLE_MUSIC_STOREFRONT: z.string().length(2).default('us'),
  YOUTUBE_CLIENT_ID: optionalNonEmpty,
  YOUTUBE_CLIENT_SECRET: optionalNonEmpty,
  YOUTUBE_REDIRECT_URI: optionalUrl,
  TOKEN_ENCRYPTION_KEY: optionalNonEmpty,
  PROVIDER_CREDENTIAL_STORE_PATH: dataPath('provider-credentials.json'),
  JAMRELAY_DATA_DIR: optionalNonEmpty,
  JAMRELAY_DB_PATH: optionalNonEmpty,
  PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_BASE_URL: z.string().url(),
  LOG_LEVEL: z.string().default('info'),
  JAMRELAY_TOOLSET: z
    .enum([
      'core',
      'playback',
      'playlists',
      'playlist_power',
      'discovery',
      'personalization',
      'transfer',
      'diagnostics',
      'dangerous',
      'all',
    ])
    .default('all'),
  MCP_AUTH_MODE: z.enum(['none', 'bearer']).default('none'),
  MCP_API_KEY: optionalNonEmpty,

  // One owner approval secret protects every OAuth client registration type.
  MCP_OAUTH_OWNER_SECRET: optionalNonEmpty,
  MCP_OAUTH_STORE_PATH: dataPath('mcp-oauth.json'),

  // Optional static multi-client registry. A missing file is treated as empty.
  MCP_OAUTH_CLIENTS_PATH: dataPath('mcp-oauth-clients.json'),

  // DCR is enabled by default when MCP OAuth itself is enabled. This lets
  // standards-compliant desktop/CLI clients register their loopback callback
  // automatically. Operators can set this to false and use only pre-registration.
  MCP_OAUTH_DCR_ENABLED: z.enum(['true', 'false']).default('true'),

  TRUST_PROXY: z.string().default('false'),
  SPOTIFY_MARKET: z.string().length(2).default('PL'),
  SPOTIFY_READ_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(12),
  // Optional, disabled-by-default adapter. The endpoint must be an operator-
  // configured API returning { candidates: [{ spotifyId|spotifyUrl }] }.
  ALTERNATE_TRACK_RESOLVER_URL: optionalUrl,
  ALTERNATE_TRACK_RESOLVER_NAME: optionalNonEmpty,
  ALTERNATE_TRACK_RESOLVER_TOKEN: optionalNonEmpty,
  ALTERNATE_TRACK_RESOLVER_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(2500),
  ALTERNATE_TRACK_RESOLVER_MAX_RESULTS: z.coerce.number().int().min(1).max(10).default(5),
});

export type Config = z.infer<typeof schema>;

export function getConfig(): Config {
  const c = schema.parse(process.env);

  const spotifyKeys = [
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'SPOTIFY_REDIRECT_URI',
  ] as const;
  const configuredSpotifyValues = spotifyKeys.filter((key) => Boolean(c[key]));
  if (configuredSpotifyValues.length > 0 && configuredSpotifyValues.length !== spotifyKeys.length) {
    const missing = spotifyKeys.filter((key) => !c[key]);
    throw new Error(`Incomplete Spotify provider configuration. Missing: ${missing.join(', ')}`);
  }
  const soundCloudKeys = [
    'SOUNDCLOUD_CLIENT_ID',
    'SOUNDCLOUD_CLIENT_SECRET',
    'SOUNDCLOUD_REDIRECT_URI',
  ] as const;
  const configuredSoundCloudValues = soundCloudKeys.filter((key) => Boolean(c[key]));
  if (
    configuredSoundCloudValues.length > 0 &&
    configuredSoundCloudValues.length !== soundCloudKeys.length
  ) {
    const missing = soundCloudKeys.filter((key) => !c[key]);
    throw new Error(`Incomplete SoundCloud provider configuration. Missing: ${missing.join(', ')}`);
  }
  const appleMusicKeys = [
    'APPLE_MUSIC_TEAM_ID',
    'APPLE_MUSIC_KEY_ID',
    'APPLE_MUSIC_PRIVATE_KEY_PATH',
  ] as const;
  const configuredAppleMusicValues = appleMusicKeys.filter((key) => Boolean(c[key]));
  if (
    configuredAppleMusicValues.length > 0 &&
    configuredAppleMusicValues.length !== appleMusicKeys.length
  ) {
    const missing = appleMusicKeys.filter((key) => !c[key]);
    throw new Error(
      `Incomplete Apple Music provider configuration. Missing: ${missing.join(', ')}`,
    );
  }
  const youtubeKeys = [
    'YOUTUBE_CLIENT_ID',
    'YOUTUBE_CLIENT_SECRET',
    'YOUTUBE_REDIRECT_URI',
  ] as const;
  const configuredYoutubeValues = youtubeKeys.filter((key) => Boolean(c[key]));
  if (configuredYoutubeValues.length > 0 && configuredYoutubeValues.length !== youtubeKeys.length) {
    const missing = youtubeKeys.filter((key) => !c[key]);
    throw new Error(`Incomplete YouTube provider configuration. Missing: ${missing.join(', ')}`);
  }
  const encryptedStorageEnabled =
    configuredSpotifyValues.length === spotifyKeys.length ||
    configuredSoundCloudValues.length === soundCloudKeys.length ||
    configuredAppleMusicValues.length === appleMusicKeys.length ||
    configuredYoutubeValues.length === youtubeKeys.length ||
    Boolean(process.env.PROVIDER_CREDENTIAL_STORE_PATH?.trim());
  if (encryptedStorageEnabled && !c.TOKEN_ENCRYPTION_KEY)
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is required when encrypted credential storage is enabled',
    );

  if (c.MCP_AUTH_MODE === 'bearer' && !c.MCP_API_KEY) {
    throw new Error('MCP_API_KEY is required in bearer mode');
  }

  return c;
}
