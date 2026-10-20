import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { messages } from '../src/cli/i18n/messages.js';
import {
  languages,
  localeLanguage,
  currentLanguage,
  translate,
  selectLanguage,
  yesNo,
  languagePrompt,
} from '../src/cli/i18n/index.js';
import { runCli } from '../src/cli.js';
import { setup } from '../src/runtime/setup.js';
import { readSettings, saveSettings } from '../src/runtime/installation.js';

const { question } = vi.hoisted(() => ({ question: vi.fn() }));
// Test the setup flow at its TUI boundary; raw key handling is covered separately.
vi.mock('../src/cli/tui.js', async (original) => ({
  ...(await original<typeof import('../src/cli/tui.js')>()),
  showPanel: (title: string, body: string) => console.log(title, body),
  promptText: async (label: string, fallback = '') => (await question(label)) || fallback,
  promptConfirm: async (label: string, _yes: string, _no: string, fallback: boolean) =>
    label.includes('password') ||
    label.includes('hasło') ||
    label.includes('passwort') ||
    label.includes('mot de passe') ||
    label.includes('contraseña')
      ? false
      : fallback,
  selectOption: async (options: Array<{ value: string }>, initial: number) => {
    for (;;) {
      const answer = await question(languagePrompt + ' [1]');
      const selected = selectLanguage(answer, options[initial].value as (typeof languages)[number]);
      if (selected) return selected;
    }
  },
}));
let root: string;
const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
let out: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'jamrelay-i18n-'));
  for (const [key, value] of Object.entries({
    JAMRELAY_CONFIG_PATH: join(root, 'private.env'),
    JAMRELAY_DATA_DIR: root,
    JAMRELAY_DB_PATH: join(root, 'jamrelay.db'),
    JAMRELAY_CLI_STATE_PATH: join(root, 'cli-state.json'),
    JAMRELAY_CACHE_DIR: join(root, 'cache'),
    JAMRELAY_LANGUAGE: '',
    JAMRELAY_INSTALL_MODE: 'local',
    PROVIDER_CREDENTIAL_STORE_PATH: join(root, 'credentials.json'),
    MCP_OAUTH_STORE_PATH: join(root, 'oauth.json'),
    MCP_OAUTH_CLIENTS_PATH: join(root, 'clients.json'),
    HOST: '127.0.0.1',
    PORT: '63241',
    PUBLIC_BASE_URL: 'http://localhost:63241',
    TRUST_PROXY: 'false',
    LC_ALL: '',
    LC_MESSAGES: '',
    LANG: 'en_US.UTF-8',
    TOKEN_ENCRYPTION_KEY: '',
    MCP_OAUTH_OWNER_SECRET: '',
  }))
    vi.stubEnv(key, value);
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
  out = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  question.mockReset().mockResolvedValue('');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (ttyDescriptor) Object.defineProperty(process.stdin, 'isTTY', ttyDescriptor);
  else delete process.stdin.isTTY;
  rmSync(root, { recursive: true, force: true });
});

it('detects locales, numeric choices, unsupported defaults and localized answers', () => {
  for (const [locale, expected] of [
    ['pl_PL.UTF-8', 'pl'],
    ['de-DE', 'de'],
    ['fr_FR@euro', 'fr'],
    ['es-MX', 'es'],
    ['en_GB', 'en'],
    ['ja_JP', 'en'],
    ['C', 'en'],
  ] as const)
    expect(localeLanguage(locale)).toBe(expected);
  expect(selectLanguage('', 'pl')).toBe('pl');
  expect(selectLanguage('0', 'en')).toBeUndefined();
  expect(selectLanguage('1.5', 'en')).toBeUndefined();
  expect(selectLanguage('2', 'pl')).toBe('en');
  const answers = {
    pl: ['tak', 'nie'],
    en: ['yes', 'no'],
    de: ['ja', 'nein'],
    fr: ['oui', 'non'],
    es: ['sí', 'no'],
  };
  for (const lang of languages) {
    expect(yesNo(answers[lang][0].toUpperCase(), lang)).toBe(true);
    expect(yesNo(answers[lang][1], lang)).toBe(false);
    expect(yesNo('yes', lang)).toBe(true);
    expect(yesNo('no', lang)).toBe(false);
    expect(yesNo('?', lang)).toBeUndefined();
  }
});
it('has complete translations and matching placeholders for every language', () => {
  for (const [key, row] of Object.entries(messages))
    for (const lang of languages) {
      const value = lang === 'en' ? key : row[lang];
      expect(value.trim().length).toBeGreaterThan(0);
      expect(value.match(/\{\d+\}/g) ?? []).toEqual(key.match(/\{\d+\}/g) ?? []);
    }
});
it.each(languages)(
  'selects %s first, persists it and reconfigures without losing secrets or paths',
  async (lang) => {
    question.mockResolvedValueOnce(String(languages.indexOf(lang) + 1));
    await setup();
    expect(question.mock.calls[0][0]).toContain(languagePrompt);
    const path = process.env.JAMRELAY_CONFIG_PATH!;
    const saved = readSettings(path);
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', undefined);
    vi.stubEnv('MCP_OAUTH_OWNER_SECRET', undefined);
    expect(saved.JAMRELAY_LANGUAGE).toBe(lang);
    const providerSettings = {
      SPOTIFY_CLIENT_ID: 'existing-id',
      SPOTIFY_CLIENT_SECRET: 'existing-secret',
      SPOTIFY_REDIRECT_URI: 'http://localhost:63241/custom-callback',
    };
    saveSettings(path, { ...saved, ...providerSettings });
    writeFileSync(saved.PROVIDER_CREDENTIAL_STORE_PATH, 'encrypted-sentinel');
    writeFileSync(saved.MCP_OAUTH_STORE_PATH, 'oauth-sentinel');
    const target = lang === 'pl' ? 'fr' : 'pl';
    question
      .mockClear()
      .mockResolvedValue('')
      .mockResolvedValueOnce(String(languages.indexOf(target) + 1));
    expect(await runCli(['config'])).toBe(0);
    expect(readSettings(path)).toEqual({
      ...saved,
      ...providerSettings,
      JAMRELAY_LANGUAGE: target,
    });
    expect(readFileSync(saved.PROVIDER_CREDENTIAL_STORE_PATH, 'utf8')).toBe('encrypted-sentinel');
    expect(readFileSync(saved.MCP_OAUTH_STORE_PATH, 'utf8')).toBe('oauth-sentinel');
    expect(currentLanguage()).toBe(target);
    vi.stubEnv('JAMRELAY_LANGUAGE', 'de');
    expect(currentLanguage()).toBe('de');
  },
);
it('uses detected default, retries invalid selection, and keeps --yes completely noninteractive', async () => {
  vi.stubEnv('LANG', 'pl_PL.UTF-8');
  question.mockResolvedValueOnce('99').mockResolvedValueOnce('');
  expect(await runCli(['setup'])).toBe(0);
  expect(question.mock.calls[0][0]).toContain('[1]');
  expect(question.mock.calls[1][0]).toContain(languagePrompt);
  expect(readSettings(process.env.JAMRELAY_CONFIG_PATH!).JAMRELAY_LANGUAGE).toBe('pl');
  question.mockClear();
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });
  vi.stubEnv('JAMRELAY_LANGUAGE', 'es');
  expect(await runCli(['setup', '--yes'])).toBe(0);
  expect(question).not.toHaveBeenCalled();
  expect(readSettings(process.env.JAMRELAY_CONFIG_PATH!).JAMRELAY_LANGUAGE).toBe('es');
});
it.each(languages)(
  'localizes help and diagnostics in %s while JSON stays English',
  async (lang) => {
    vi.stubEnv('JAMRELAY_LANGUAGE', lang);
    expect(await runCli(['--help'])).toBe(0);
    expect(out.mock.calls.at(-1)?.[0]).toContain(translate('Run the MCP HTTP server', lang));
    expect(await runCli(['doctor', '--json'])).toBe(1);
    const result = JSON.parse(out.mock.calls.at(-1)![0]);
    expect(Object.keys(result)).toEqual(['configuration', 'errors', 'warnings', 'ok']);
    expect(result.errors.join(' ')).toContain('Configuration/path/database validation failed');
    expect(await runCli(['doctor'])).toBe(1);
    expect(out.mock.calls.at(-1)?.[0]).toContain(translate('Errors', lang));
    expect(await runCli(['notifications', 'status', '--json'])).toBe(0);
    expect(JSON.parse(out.mock.calls.at(-1)![0]).preference).toBe('not selected');
    expect(await runCli(['notifications', 'status'])).toBe(0);
    expect(out.mock.calls.at(-1)?.[0]).toContain(translate('Notifications', lang));
  },
);
it('cancels setup without saving partial configuration', async () => {
  question.mockRejectedValueOnce(new Error('aborted'));
  expect(await runCli(['setup'])).toBe(1);
  expect(readSettings(process.env.JAMRELAY_CONFIG_PATH!)).toEqual({});
});
it('preserves every existing machine-readable information/status interface across languages', async () => {
  const commands = [
    ['info', '--json'],
    ['status', '--json'],
    ['update', 'check', '--offline', '--json'],
    ['doctor', '--json'],
    ['notices', '--offline', '--json'],
    ['notifications', 'status', '--json'],
  ];
  for (const args of commands) {
    vi.stubEnv('JAMRELAY_LANGUAGE', 'en');
    const expectedCode = await runCli(args);
    const expected = JSON.parse(out.mock.calls.at(-1)![0]);
    for (const lang of languages) {
      vi.stubEnv('JAMRELAY_LANGUAGE', lang);
      expect(await runCli(args)).toBe(expectedCode);
      expect(JSON.parse(out.mock.calls.at(-1)![0])).toEqual(expected);
    }
  }
});
