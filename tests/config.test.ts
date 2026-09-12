import { afterEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { getConfig } from '../src/config.js';

const original = { ...process.env };

const baseEnv = () => ({
  SPOTIFY_CLIENT_ID: 'spotify-client',
  SPOTIFY_CLIENT_SECRET: 'spotify-secret',
  SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:3000/auth/spotify/callback',
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PUBLIC_BASE_URL: 'http://127.0.0.1:3000',
  MCP_AUTH_MODE: 'none',
});

const useEnv = (values: Record<string, string>) => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, original, values);
  for (const key of [
    'MCP_OAUTH_CLIENT_ID',
    'MCP_OAUTH_CLIENT_SECRET',
    'MCP_OAUTH_REDIRECT_URI',
    'MCP_OAUTH_OWNER_SECRET',
    'MCP_API_KEY',
    'MCP_OAUTH_CLIENTS_PATH',
    'MCP_OAUTH_DCR_ENABLED',
  ])
    if (!(key in values)) delete process.env[key];
};

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, original);
});

describe('configuration', () => {
  it('allows MCP OAuth to be completely disabled', () => {
    useEnv(baseEnv());
    const cfg = getConfig();
    expect(cfg.MCP_OAUTH_CLIENT_ID).toBeUndefined();
    expect(cfg.MCP_OAUTH_CLIENT_SECRET).toBeUndefined();
    expect(cfg.MCP_OAUTH_REDIRECT_URI).toBeUndefined();
    expect(cfg.MCP_OAUTH_OWNER_SECRET).toBeUndefined();
    expect(cfg.SPOTIFY_TOKEN_STORE_PATH).toContain('spotify-token.json');
    expect(cfg.MCP_OAUTH_STORE_PATH).toContain('mcp-oauth.json');
    expect(cfg.MCP_OAUTH_CLIENTS_PATH).toContain('mcp-oauth-clients.json');
    expect(cfg.MCP_OAUTH_DCR_ENABLED).toBe('true');
  });

  it('allows owner-only OAuth configuration for DCR clients', () => {
    useEnv({ ...baseEnv(), MCP_OAUTH_OWNER_SECRET: 'owner-secret' });
    const cfg = getConfig();
    expect(cfg.MCP_OAUTH_OWNER_SECRET).toBe('owner-secret');
    expect(cfg.MCP_OAUTH_CLIENT_ID).toBeUndefined();
    expect(cfg.MCP_OAUTH_DCR_ENABLED).toBe('true');
  });

  it('rejects a partial MCP OAuth configuration', () => {
    useEnv({ ...baseEnv(), MCP_OAUTH_CLIENT_ID: 'partial-client' });
    expect(() => getConfig()).toThrow(/Incomplete legacy MCP OAuth client configuration/);
  });

  it('requires MCP_API_KEY when static bearer mode is enabled', () => {
    useEnv({ ...baseEnv(), MCP_AUTH_MODE: 'bearer' });
    expect(() => getConfig()).toThrow(/MCP_API_KEY is required/);
  });
});
