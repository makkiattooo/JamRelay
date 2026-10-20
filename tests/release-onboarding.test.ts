import { parse } from 'jsonc-parser';
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mergeClientConfig,
  claudeAddArgs,
  codexAddArgs,
  verifyClient,
} from '../src/cli/client-installation.js';
import { probeHealth, probeOrigin } from '../src/cli/network-context.js';
import { APP_VERSION } from '../src/version.js';
import { verifyEndpoint } from '../src/cli/connectivity.js';
import { promptText, selectOption, setTuiContext } from '../src/cli/tui.js';
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
      : Response.json({ status: 'ok', version: APP_VERSION, database: { schemaState: 'current' } });
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
      '{ // preserve this comment\n \"theme\": \"dark\", \"mcpServers\": { \"other\": { \"url\": \"https://other.example/mcp\" } },\n}\n',
    );
    mergeClientConfig(path, 'cursor', 'http://127.0.0.1:15268/mcp');
    expect(readFileSync(path, 'utf8')).toContain('// preserve this comment');
    expect(() => mergeClientConfig(path, 'cursor', 'http://127.0.0.1:5267/mcp')).toThrow(
      'different jamrelay registration',
    );
    expect(parse(readFileSync(path, 'utf8'))).toMatchObject({
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
    expect(codexAddArgs('http://127.0.0.1:15268/mcp')).toEqual([
      'mcp',
      'add',
      'jamrelay',
      '--url',
      'http://127.0.0.1:15268/mcp',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it('rejects a healthy but outdated JamRelay server version', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ status: 'ok', version: '1.5.4', database: { schemaState: 'current' } }),
  );
  expect(await probeHealth('http://127.0.0.1:15268')).toBe(false);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ status: 'ok', version: APP_VERSION, database: { schemaState: 'current' } }),
  );
  expect(await probeHealth('http://127.0.0.1:15268')).toBe(true);
});
it('reports an older healthy service as unavailable in the connectivity wizard', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
    String(url).endsWith('/mcp')
      ? new Response('', { status: 401 })
      : Response.json({ status: 'ok', version: '1.5.4', database: { schemaState: 'current' } }),
  );
  expect(await verifyEndpoint('http://127.0.0.1:15268', true)).toEqual({
    dns: null,
    https: null,
    health: false,
    mcpProtected: true,
  });
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

it('updates only the masked input row while typing in the interactive TUI', async () => {
  const descriptors = [
    Object.getOwnPropertyDescriptor(process.stdin, 'isTTY'),
    Object.getOwnPropertyDescriptor(process.stdout, 'isTTY'),
    Object.getOwnPropertyDescriptor(process.stdin, 'setRawMode'),
  ];
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
  Object.defineProperty(process.stdin, 'setRawMode', { configurable: true, value: vi.fn() });
  vi.stubEnv('WT_SESSION', '1');
  vi.stubEnv('NO_COLOR', undefined);
  vi.stubEnv('TERM', 'xterm-256color');
  vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin);
  vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin);
  const writes: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
    writes.push(String(chunk));
    return true;
  });
  try {
    setTuiContext({ step: 2, total: 6, language: 'en' });
    const pending = promptText('Password', '', { secret: true, context: 'Credentials' });
    process.stdin.emit('keypress', 'a', { name: 'a' });
    process.stdin.emit('keypress', 'b', { name: 'b' });
    process.stdin.emit('keypress', '\r', { name: 'return' });
    expect(await pending).toBe('ab');
    expect(writes.filter((part) => part.includes('\u001b[2J'))).toHaveLength(1);
    expect(writes.join('')).toContain('••');
    expect(writes.join('')).not.toContain('ab');
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
