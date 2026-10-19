import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/cli.js';
import { readSettings, saveSettings, lockInstallation } from '../src/runtime/installation.js';
import { validateSettings } from '../src/runtime/setup.js';
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'jamrelay-install-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});
it('dispatches help/version without starting a server or requiring configuration', async () => {
  const out = vi.spyOn(console, 'log').mockImplementation(() => {});
  expect(await runCli(['--help'])).toBe(0);
  expect(out.mock.calls.flat().join('')).toContain('setup');
  expect(await runCli(['--version'])).toBe(0);
  expect(out.mock.calls.at(-1)?.[0]).toBe('1.5.0');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await runCli(['unknown'])).toBe(2);
});
it('atomically persists private multiline config and excludes competing setup/start', async () => {
  const path = join(root, 'config.env');
  const saved = {
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
    MCP_OAUTH_OWNER_SECRET: 'a'.repeat(40),
    TEST: 'line1\nline2',
  };
  saveSettings(path, saved);
  saveSettings(path, { ...readSettings(path), PORT: '5268' });
  expect(readSettings(path)).toEqual({ ...saved, PORT: '5268' });
  if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
  expect(readFileSync(path, 'utf8')).toContain(saved.TOKEN_ENCRYPTION_KEY);
  const release = await lockInstallation(path);
  try {
    await expect(lockInstallation(path)).rejects.toThrow('running');
  } finally {
    release();
  }
  (await lockInstallation(path))();
});
it('validates secure managed configuration without weakening existing OAuth', () => {
  const config = {
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
    MCP_OAUTH_OWNER_SECRET: 'b'.repeat(40),
    PUBLIC_BASE_URL: 'http://localhost:5267',
    JAMRELAY_DATA_DIR: root,
    JAMRELAY_DB_PATH: join(root, 'db'),
    PROVIDER_CREDENTIAL_STORE_PATH: join(root, 'creds'),
    MCP_OAUTH_STORE_PATH: join(root, 'oauth'),
    MCP_OAUTH_CLIENTS_PATH: join(root, 'clients'),
  };
  expect(validateSettings(config).PORT).toBe(5267);
  expect(() => validateSettings({ ...config, PUBLIC_BASE_URL: 'http://remote.example' })).toThrow(
    'HTTPS',
  );
  expect(() => validateSettings({ ...config, TOKEN_ENCRYPTION_KEY: 'short' })).toThrow('32 bytes');
});
