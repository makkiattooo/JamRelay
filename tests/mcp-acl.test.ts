import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { McpOAuthStore } from '../src/mcp/oauth.js';
import { OwnerSessionStore } from '../src/mcp/owner-session.js';
import { registerTools } from '../src/mcp/tools.js';
import { toolContext } from '../src/mcp/context.js';
import type { ProviderConnection } from '../src/providers/types.js';

const connection = (connectionId: string, provider: string): ProviderConnection => ({
  summary: { connectionId, provider, connected: true, capabilities: { catalog: true } },
});

describe('owner sessions', () => {
  it('uses a rotating, CSRF-bound session and invalidates the old token', () => {
    const store = new OwnerSessionStore();
    const first = store.authenticate('secret', 'secret')!;
    expect(first.token).not.toBe(first.csrf);
    expect(store.get(first.token)).toMatchObject({ csrf: first.csrf });
    const second = store.rotate(first.token)!;
    expect(store.get(first.token)).toBeUndefined();
    expect(store.get(second.token)).toMatchObject({ csrf: second.csrf });
    expect(store.authenticate('wrong', 'secret')).toBeUndefined();
  });
});

describe('MCP grant ACLs', () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it('binds tokens to connection and permission grants and revocation invalidates them', async () => {
    directory = await mkdtemp(join(tmpdir(), 'jamrelay-acl-'));
    const store = new McpOAuthStore(join(directory, 'oauth.json'));
    await store.setGrant('client-a', ['spotify-main'], ['catalog.read']);
    const tokens = await store.issueTokens('client-a');
    expect(await store.accessPolicy(tokens.access)).toMatchObject({
      clientId: 'client-a',
      connectionIds: ['spotify-main'],
      permissions: ['catalog.read'],
    });
    await store.revokeGrant('client-a');
    expect(await store.accessPolicy(tokens.access)).toBeUndefined();
  });

  it('rejects tokens that have no current consent grant', async () => {
    directory = await mkdtemp(join(tmpdir(), 'jamrelay-acl-'));
    const store = new McpOAuthStore(join(directory, 'oauth.json'));
    const tokens = await store.issueTokens('legacy-client');
    expect(await store.accessPolicy(tokens.access)).toBeUndefined();
  });

  it('filters get_connections to the grant and denies missing diagnostics permission', async () => {
    const callbacks = new Map<string, (input: any) => Promise<any>>();
    const server = {
      registerTool(name: string, _config: unknown, callback: (input: any) => Promise<any>) {
        callbacks.set(name, callback);
      },
    };
    const registry = {
      listConnections: () => [
        connection('spotify-main', 'spotify').summary,
        connection('soundcloud-main', 'soundcloud').summary,
      ],
      getConnection: () => undefined,
    } as any;
    registerTools(server as any, {} as any, undefined, false, registry);
    const context = {
      requestId: `test-${randomBytes(4).toString('hex')}`,
      signal: new AbortController().signal,
      deadlineAt: Date.now() + 1000,
      mcpAccess: {
        clientId: 'client-a',
        connectionIds: ['spotify-main'],
        permissions: ['diagnostics.read'],
      },
    };
    const result = await toolContext.run(context, () => callbacks.get('get_connections')!({}));
    expect(result.structuredContent.map((x: any) => x.connection_id)).toEqual(['spotify-main']);

    const denied = await toolContext.run(
      { ...context, mcpAccess: { ...context.mcpAccess, permissions: [] } },
      () => callbacks.get('get_connections')!({}),
    );
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toContain('PERMISSION_NOT_GRANTED');
  });
});
