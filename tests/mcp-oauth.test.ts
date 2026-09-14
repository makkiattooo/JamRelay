import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/index.js';
import { McpOAuthStore } from '../src/mcp/oauth.js';

const base = 'http://127.0.0.1';
const cfg = (path: string, clientsPath: string, overrides: Record<string, unknown> = {}): any => ({
  SPOTIFY_CLIENT_ID: 'spotify-id',
  SPOTIFY_CLIENT_SECRET: 'spotify-secret',
  SPOTIFY_REDIRECT_URI: 'https://example.com/spotify-callback',
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PORT: 0,
  HOST: '127.0.0.1',
  PUBLIC_BASE_URL: base,
  LOG_LEVEL: 'silent',
  MCP_AUTH_MODE: 'bearer',
  MCP_API_KEY: 'manual-key',
  MCP_OAUTH_OWNER_SECRET: 'owner-secret',
  MCP_OAUTH_STORE_PATH: path,
  MCP_OAUTH_CLIENTS_PATH: clientsPath,
  MCP_OAUTH_DCR_ENABLED: 'true',
  TRUST_PROXY: 'false',
  SPOTIFY_MARKET: 'PL',
  ...overrides,
});

const challenge = (value: string) => createHash('sha256').update(value).digest('base64url');
const json = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, init);
  return { r, body: await r.json().catch(() => undefined) };
};

describe('MCP OAuth', () => {
  let server: any;
  let directory: string;

  afterEach(async () => {
    vi.useRealTimers();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (directory) await rm(directory, { recursive: true, force: true });
    server = undefined;
  });

  async function start(
    overrides: Record<string, unknown> = {},
    staticClients?: Record<string, unknown>,
  ) {
    directory = await mkdtemp(join(tmpdir(), 'jamrelay-oauth-'));
    const clientsPath = join(directory, 'clients.json');
    await writeFile(
      clientsPath,
      JSON.stringify(
        staticClients ?? {
          clients: [
            {
              clientId: 'chatgpt-client',
              clientName: 'ChatGPT',
              clientSecret: 'chatgpt-secret',
              redirectUris: ['https://chatgpt.com/connector/oauth/callback'],
            },
          ],
        },
      ),
    );
    const app = createApp(cfg(join(directory, 'oauth.json'), clientsPath, overrides), {
      auth: { connected: async () => false } as any,
      client: { request: async () => null, json: async () => null } as any,
      logger: { info() {}, warn() {} } as any,
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }

  async function authorize(root: string, owner = 'owner-secret') {
    const verifier = 'verifier-value';
    const query = new URLSearchParams({
      client_id: 'chatgpt-client',
      redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
      response_type: 'code',
      code_challenge: challenge(verifier),
      code_challenge_method: 'S256',
      state: 'state with spaces',
      resource: `${base}/mcp`,
    });
    const page = await fetch(`${root}/oauth/authorize?${query}`);
    expect(page.status).toBe(200);
    const form = new URLSearchParams({
      client_id: 'chatgpt-client',
      redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
      response_type: 'code',
      code_challenge: challenge(verifier),
      code_challenge_method: 'S256',
      state: 'state with spaces',
      resource: `${base}/mcp`,
      owner_secret: owner,
    });
    const response = await fetch(`${root}/oauth/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      redirect: 'manual',
    });
    return { response, verifier };
  }

  async function registerPublicClient(root: string, redirectUri: string, name = 'Gemini CLI') {
    return json(`${root}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: name,
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        application_type: 'native',
      }),
    });
  }

  it('publishes protected-resource and authorization-server metadata including DCR', async () => {
    const root = await start();
    const resource = await json(`${root}/.well-known/oauth-protected-resource`);
    expect(resource.body).toEqual({
      resource: `${base}/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ['header'],
    });
    const suffixed = await json(`${root}/.well-known/oauth-protected-resource/mcp`);
    expect(suffixed.body).toEqual(resource.body);
    const metadata = await json(`${root}/.well-known/oauth-authorization-server`);
    expect(metadata.body).toMatchObject({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    });
  });

  it('returns 401 with resource metadata and keeps MCP_API_KEY working', async () => {
    const root = await start();
    const missing = await json(`${root}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(missing.r.status).toBe(401);
    expect(missing.r.headers.get('www-authenticate')).toContain('resource_metadata=');
    const valid = await json(`${root}/mcp`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer manual-key',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(valid.r.status).toBe(200);
  });

  it('requires the configured client, exact redirect, PKCE, resource, and owner secret', async () => {
    const root = await start();
    const bad = await fetch(
      `${root}/oauth/authorize?client_id=wrong&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector%2Foauth%2Fcallback&response_type=code`,
    );
    expect(bad.status).toBe(400);
    const noPkce = await fetch(
      `${root}/oauth/authorize?client_id=chatgpt-client&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector%2Foauth%2Fcallback&response_type=code`,
    );
    expect(noPkce.status).toBe(400);
    const wrongResource = await fetch(
      `${root}/oauth/authorize?${new URLSearchParams({
        client_id: 'chatgpt-client',
        redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
        response_type: 'code',
        code_challenge: challenge('x'),
        code_challenge_method: 'S256',
        resource: 'https://evil.example/mcp',
      })}`,
    );
    expect(wrongResource.status).toBe(400);
    const denied = await authorize(root, 'wrong');
    expect(denied.response.status).toBe(401);
    expect(await denied.response.text()).toContain('Invalid owner secret');
  });

  it('renders a branded, non-cacheable authorization page without exposing callback details', async () => {
    const root = await start();
    const query = new URLSearchParams({
      client_id: 'chatgpt-client',
      redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
      response_type: 'code',
      code_challenge: challenge('verifier-value'),
      code_challenge_method: 'S256',
      state: 'safe-state',
      resource: `${base}/mcp`,
    });
    const page = await fetch(`${root}/oauth/authorize?${query}`);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(page.headers.get('referrer-policy')).toBe('no-referrer');
    expect(html).toContain('Connect ChatGPT to JamRelay');
    expect(html).toContain('/assets/icons/jamrelay-icon-dark.png.png');
    expect(html).toContain('JamRelay Connect');
    expect(html).toContain('Authorize access');
    expect(html).toContain('type="password"');
    expect(html).not.toContain('https://chatgpt.com/connector/oauth/callback</');
    expect(html).not.toContain('value="owner-secret"');
  });

  it('shows specific OAuth request errors and redirects cancellation safely', async () => {
    const root = await start();
    const invalidClient = await fetch(
      `${root}/oauth/authorize?${new URLSearchParams({
        client_id: 'unknown-client',
        redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
        response_type: 'code',
      })}`,
    );
    expect(invalidClient.status).toBe(400);
    expect(await invalidClient.text()).toContain('Invalid client');

    const invalidRedirect = await fetch(
      `${root}/oauth/authorize?${new URLSearchParams({
        client_id: 'chatgpt-client',
        redirect_uri: 'https://example.com/wrong',
        response_type: 'code',
      })}`,
    );
    expect(invalidRedirect.status).toBe(400);
    expect(await invalidRedirect.text()).toContain('Invalid redirect URI');

    const invalidRequest = await fetch(
      `${root}/oauth/authorize?${new URLSearchParams({
        client_id: 'chatgpt-client',
        redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
        response_type: 'code',
      })}`,
    );
    expect(invalidRequest.status).toBe(400);
    expect(await invalidRequest.text()).toContain('Invalid OAuth request');

    const cancelled = await fetch(`${root}/oauth/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: 'chatgpt-client',
        redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
        response_type: 'code',
        code_challenge: challenge('verifier-value'),
        code_challenge_method: 'S256',
        state: 'cancel-state',
        resource: `${base}/mcp`,
        decision: 'cancel',
      }),
      redirect: 'manual',
    });
    const location = new URL(cancelled.headers.get('location')!);
    expect(cancelled.status).toBe(302);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('state')).toBe('cancel-state');
  });

  it('runs authorization code PKCE once and preserves state and issuer', async () => {
    const root = await start();
    const { response, verifier } = await authorize(root);
    expect(response.status).toBe(302);
    const location = response.headers.get('location')!;
    const callback = new URL(location);
    expect(callback.searchParams.get('state')).toBe('state with spaces');
    expect(callback.searchParams.get('iss')).toBe(base);
    const exchanged = await json(`${root}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'chatgpt-client',
        client_secret: 'chatgpt-secret',
        code: callback.searchParams.get('code')!,
        redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
        code_verifier: verifier,
        resource: `${base}/mcp`,
      }),
    });
    expect(exchanged.r.status).toBe(200);
    expect(exchanged.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
    const reused = await json(`${root}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'chatgpt-client',
        client_secret: 'chatgpt-secret',
        code: callback.searchParams.get('code')!,
        redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
        code_verifier: verifier,
        resource: `${base}/mcp`,
      }),
    });
    expect(reused.body.error).toBe('invalid_grant');
  });

  it('accepts the OAuth access token, rejects invalid tokens, and rotates refresh tokens', async () => {
    const root = await start();
    const { response, verifier } = await authorize(root);
    const code = new URL(response.headers.get('location')!).searchParams.get('code')!;
    const issued = await json(`${root}/oauth/token`, {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from('chatgpt-client:chatgpt-secret').toString('base64'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
        code_verifier: verifier,
        resource: `${base}/mcp`,
      }),
    });
    const access = issued.body.access_token;
    const ok = await json(`${root}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    expect(ok.r.status).toBe(200);
    const invalid = await json(`${root}/mcp`, {
      method: 'POST',
      headers: { authorization: 'Bearer invalid', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(invalid.r.status).toBe(401);
    const refreshed = await json(`${root}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'chatgpt-client',
        client_secret: 'chatgpt-secret',
        refresh_token: issued.body.refresh_token,
        resource: `${base}/mcp`,
      }),
    });
    expect(refreshed.r.status).toBe(200);
    expect(refreshed.body.refresh_token).not.toBe(issued.body.refresh_token);
  });

  it('supports DCR public clients with loopback callbacks and no client secret', async () => {
    const root = await start();
    const redirectUri = 'http://localhost:54321/oauth/callback';
    const registered = await registerPublicClient(root, redirectUri);
    expect(registered.r.status).toBe(201);
    expect(registered.body.client_id).toMatch(/^dcr_/);
    expect(registered.body.client_secret).toBeUndefined();
    expect(registered.body.token_endpoint_auth_method).toBe('none');

    const verifier = 'gemini-verifier';
    const clientId = registered.body.client_id as string;
    const page = await fetch(
      `${root}/oauth/authorize?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        code_challenge: challenge(verifier),
        code_challenge_method: 'S256',
        state: 'gemini-state',
        resource: `${base}/mcp`,
      })}`,
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Gemini CLI');

    const approved = await fetch(`${root}/oauth/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        code_challenge: challenge(verifier),
        code_challenge_method: 'S256',
        state: 'gemini-state',
        resource: `${base}/mcp`,
        owner_secret: 'owner-secret',
      }),
      redirect: 'manual',
    });
    expect(approved.status).toBe(302);
    const callback = new URL(approved.headers.get('location')!);
    expect(callback.searchParams.get('iss')).toBe(base);

    const issued = await json(`${root}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: callback.searchParams.get('code')!,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource: `${base}/mcp`,
      }),
    });
    expect(issued.r.status).toBe(200);
    expect(issued.body.access_token).toBeTypeOf('string');

    const refreshed = await json(`${root}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: issued.body.refresh_token,
        resource: `${base}/mcp`,
      }),
    });
    expect(refreshed.r.status).toBe(200);
  });

  it('supports multiple statically pre-registered clients from one registry file', async () => {
    const root = await start(
      {
        MCP_OAUTH_DCR_ENABLED: 'false',
      },
      {
        clients: [
          {
            clientId: 'cursor-client',
            clientName: 'Cursor',
            clientSecret: 'cursor-secret',
            redirectUris: [
              'http://localhost:8787/callback',
              'https://www.cursor.com/agents/mcp/oauth/callback',
            ],
          },
          {
            clientId: 'vscode-client',
            clientName: 'VS Code',
            redirectUris: ['http://127.0.0.1:33418', 'https://vscode.dev/redirect'],
            tokenEndpointAuthMethods: ['none'],
          },
        ],
      },
    );

    const cursor = await fetch(
      `${root}/oauth/authorize?${new URLSearchParams({
        client_id: 'cursor-client',
        redirect_uri: 'http://localhost:8787/callback',
        response_type: 'code',
        code_challenge: challenge('cursor'),
        code_challenge_method: 'S256',
      })}`,
    );
    expect(cursor.status).toBe(200);
    expect(await cursor.text()).toContain('Cursor');

    const vscode = await fetch(
      `${root}/oauth/authorize?${new URLSearchParams({
        client_id: 'vscode-client',
        redirect_uri: 'http://127.0.0.1:33418',
        response_type: 'code',
        code_challenge: challenge('vscode'),
        code_challenge_method: 'S256',
      })}`,
    );
    expect(vscode.status).toBe(200);
    expect(await vscode.text()).toContain('VS Code');

    const metadata = await json(`${root}/.well-known/oauth-authorization-server`);
    expect(metadata.body.registration_endpoint).toBeUndefined();
  });

  it('accepts private-use callbacks only for native dynamic clients', async () => {
    const root = await start();
    const native = await json(`${root}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Native MCP client',
        redirect_uris: ['cursor://anysphere.cursor-mcp/oauth/callback'],
        token_endpoint_auth_method: 'none',
        application_type: 'native',
      }),
    });
    expect(native.r.status).toBe(201);

    const web = await json(`${root}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Web client',
        redirect_uris: ['cursor://anysphere.cursor-mcp/oauth/callback'],
        token_endpoint_auth_method: 'none',
        application_type: 'web',
      }),
    });
    expect(web.r.status).toBe(400);
    expect(web.body.error).toBe('invalid_redirect_uri');

    const dangerous = await json(`${root}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Bad native client',
        redirect_uris: ['file:///tmp/callback'],
        token_endpoint_auth_method: 'none',
        application_type: 'native',
      }),
    });
    expect(dangerous.r.status).toBe(400);
  });

  it('rejects malformed DCR metadata and malformed Basic client authentication', async () => {
    const root = await start();

    const badRedirectArray = await json(`${root}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Bad DCR client',
        redirect_uris: ['http://localhost:5555/callback', 42],
        token_endpoint_auth_method: 'none',
        application_type: 'native',
      }),
    });
    expect(badRedirectArray.r.status).toBe(400);
    expect(badRedirectArray.body.error).toBe('invalid_client_metadata');

    const badGrantArray = await json(`${root}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Bad DCR client',
        redirect_uris: ['http://localhost:5555/callback'],
        grant_types: ['authorization_code', 42],
        token_endpoint_auth_method: 'none',
        application_type: 'native',
      }),
    });
    expect(badGrantArray.r.status).toBe(400);
    expect(badGrantArray.body.error).toBe('invalid_client_metadata');

    const malformedBasic = await json(`${root}/oauth/token`, {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from('missing-colon').toString('base64'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'chatgpt-client',
        refresh_token: 'not-a-token',
      }),
    });
    expect(malformedBasic.r.status).toBe(401);
    expect(malformedBasic.body.error).toBe('invalid_client');
  });

  it('rejects unsafe DCR redirect URIs and can disable dynamic registration', async () => {
    let root = await start();
    const unsafe = await registerPublicClient(root, 'http://example.com/callback');
    expect(unsafe.r.status).toBe(400);
    expect(unsafe.body.error).toBe('invalid_redirect_uri');

    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = undefined;
    await rm(directory, { recursive: true, force: true });
    directory = '';

    root = await start({ MCP_OAUTH_DCR_ENABLED: 'false' });
    const disabled = await registerPublicClient(root, 'http://localhost:5555/callback');
    expect(disabled.r.status).toBe(404);
    const metadata = await json(`${root}/.well-known/oauth-authorization-server`);
    expect(metadata.body.registration_endpoint).toBeUndefined();
  });

  it('rejects a bad client secret and expires codes and access tokens', async () => {
    const root = await start();
    const badClient = await json(`${root}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'chatgpt-client',
        client_secret: 'wrong',
      }),
    });
    expect(badClient.r.status).toBe(401);
    const { response } = await authorize(root);
    const store = new McpOAuthStore(join(directory, 'oauth.json'));
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now + 6 * 60_000);
    const expired = await store.exchangeCode(
      new URL(response.headers.get('location')!).searchParams.get('code')!,
      'chatgpt-client',
      'https://chatgpt.com/connector/oauth/callback',
      'verifier-value',
    );
    expect(expired).toBe(false);
    vi.setSystemTime(now);
    const issued = await store.issueTokens('chatgpt-client');
    expect(await store.validAccess(issued.access)).toBe(true);
    vi.setSystemTime(now + 61 * 60_000);
    expect(await store.validAccess(issued.access)).toBe(false);
  });

  it('rejects an invalid code verifier without consuming the code', async () => {
    directory = await mkdtemp(join(tmpdir(), 'jamrelay-pkce-'));
    const store = new McpOAuthStore(join(directory, 'oauth.json'));
    const code = await store.issueCode({
      clientId: 'chatgpt-client',
      redirectUri: 'https://chatgpt.com/connector/oauth/callback',
      challenge: challenge('correct-verifier'),
    });
    expect(
      await store.exchangeCode(
        code,
        'chatgpt-client',
        'https://chatgpt.com/connector/oauth/callback',
        'wrong-verifier',
      ),
    ).toBe(false);
    expect(
      await store.exchangeCode(
        code,
        'chatgpt-client',
        'https://chatgpt.com/connector/oauth/callback',
        'correct-verifier',
      ),
    ).toBe(true);
  });
});
