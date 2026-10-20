import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeClientConfig, claudeAddArgs, verifyClient } from '../src/cli/client-installation.js';
import { probeOrigin } from '../src/cli/network-context.js';
import { verifyEndpoint } from '../src/cli/connectivity.js';
import { selectOption } from '../src/cli/tui.js';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('probes Compose instead of host loopback and never marks DNS or TLS verified for local HTTP', async () => {
  vi.stubEnv('JAMRELAY_INSTALL_MODE', 'docker');
  vi.stubEnv('PORT', '5267');
  const origin = 'http://127.0.0.1:15268';
  expect(probeOrigin(origin)).toBe('http://jamrelay:5267');
  expect(probeOrigin('https://music.example.com')).toBe('https://music.example.com');
  const targets: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    targets.push(String(url));
    return String(url).endsWith('/mcp')
      ? new Response('', { status: 401 })
      : Response.json({ status: 'ok', version: '1.5.5', database: { schemaState: 'current' } });
  });
  expect(await verifyEndpoint(origin, true)).toEqual({
    dns: null,
    https: null,
    health: true,
    mcpProtected: true,
  });
  expect(targets).toEqual(['http://jamrelay:5267/health', 'http://jamrelay:5267/mcp']);
});
it('merges only the selected MCP entry, backs up original settings and uses argument-safe Claude registration', () => {
  const root = mkdtempSync(join(tmpdir(), 'jamrelay-client-'));
  try {
    const path = join(root, 'mcp.json');
    writeFileSync(
      path,
      JSON.stringify({
        theme: 'dark',
        mcpServers: { other: { url: 'https://other.example/mcp' } },
      }),
    );
    mergeClientConfig(path, 'cursor', 'http://127.0.0.1:15268/mcp');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      theme: 'dark',
      mcpServers: {
        other: { url: 'https://other.example/mcp' },
        jamrelay: { url: 'http://127.0.0.1:15268/mcp' },
      },
    });
    expect(readdirSync(root).filter((p) => p.endsWith('.bak'))).toHaveLength(1);
    expect(claudeAddArgs('http://127.0.0.1:15268/mcp')).toEqual([
      'mcp',
      'add',
      '--transport',
      'http',
      'jamrelay',
      'http://127.0.0.1:15268/mcp',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it('selects a numeric TUI shortcut immediately without Enter', async () => {
  const descriptors = [
    Object.getOwnPropertyDescriptor(process.stdin, 'isTTY'),
    Object.getOwnPropertyDescriptor(process.stdout, 'isTTY'),
    Object.getOwnPropertyDescriptor(process.stdin, 'setRawMode'),
  ];
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
  Object.defineProperty(process.stdin, 'setRawMode', { configurable: true, value: vi.fn() });
  vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin);
  vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin);
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  try {
    const pending = selectOption([
      { label: 'English', value: 'en' },
      { label: 'Polski', value: 'pl' },
    ]);
    process.stdin.emit('keypress', '2', { name: '2' });
    expect(await pending).toBe('pl');
  } finally {
    for (const [index, [object, key]] of [
      [process.stdin, 'isTTY'],
      [process.stdout, 'isTTY'],
      [process.stdin, 'setRawMode'],
    ].entries()) {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(object, key, descriptor);
      else Reflect.deleteProperty(object, key);
    }
  }
});

it('does not mistake Claude Code OAuth evidence for a Claude Desktop connection', async () => {
  const root = mkdtempSync(join(tmpdir(), 'jamrelay-client-evidence-'));
  vi.stubEnv('MCP_OAUTH_STORE_PATH', join(root, 'oauth.json'));
  vi.stubEnv('MCP_OAUTH_CLIENTS_PATH', join(root, 'clients.json'));
  vi.stubEnv('JAMRELAY_CLI_STATE_PATH', join(root, 'state.json'));
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  writeFileSync(
    join(root, 'clients.json'),
    JSON.stringify({
      clients: [
        {
          clientId: 'code-only',
          clientName: 'Claude Code (jamrelay)',
          redirectUris: ['http://127.0.0.1/callback'],
        },
      ],
    }),
  );
  try {
    expect(await verifyClient('claude-desktop', 'http://127.0.0.1:5267/mcp')).toBe(false);
    expect(
      JSON.parse(readFileSync(join(root, 'state.json'), 'utf8')).clientSetup['claude-desktop']
        .status,
    ).toBe('authentication_required');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
