import { parse, modify, applyEdits, type ParseError } from 'jsonc-parser';
import { randomBytes } from 'node:crypto';
import { openBrowser, isContainer, publicHttpsEndpoint } from './browser.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  existsSync,
  lstatSync,
  readFileSync,
  copyFileSync,
  chmodSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { changeState, readState, type CliState } from './state.js';
import { menuPanel, selectOption, showPanel } from './tui.js';
import { isLoopbackHttp, probeHealth } from './network-context.js';
import { McpOAuthStore, StaticOAuthClientRegistry } from '../mcp/oauth.js';
import { openSqlite } from '../runtime/sqlite.js';

const execute = promisify(execFile);
export type InstallClient =
  'chatgpt' | 'codex' | 'claude-code' | 'claude-desktop' | 'cursor' | 'vscode' | 'generic';
type Status = CliState['clientSetup'][string]['status'];
export const statusLabels: Record<Status, string> = {
  not_configured: 'Not configured',
  configuration_generated: 'Configuration generated',
  configured: 'Configured',
  authentication_required: 'Authentication required',
  authenticated: 'Authenticated',
  verified: 'Verified',
  failed: 'Failed',
};
async function choose(title: string, labels: string[]) {
  return selectOption(
    labels.map((value) => ({ label: value, value })),
    0,
    (index) => menuPanel(title, labels, index),
  );
}
export type FileClient = 'cursor' | 'vscode' | 'claude-desktop';
export function clientConfig(client: FileClient, endpoint: string) {
  return client === 'vscode'
    ? { servers: { jamrelay: { type: 'http', url: endpoint } } }
    : {
        mcpServers: {
          jamrelay:
            client === 'claude-desktop'
              ? {
                  command: 'npx',
                  args: [
                    '-y',
                    'mcp-remote@0.15.1',
                    endpoint,
                    ...(isLoopbackHttp(new URL(endpoint).origin) ? ['--allow-http'] : []),
                  ],
                }
              : { url: endpoint },
        },
      };
}
function readConfig(text: string) {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !value || Array.isArray(value) || typeof value !== 'object')
    throw new Error('Client configuration must contain a valid JSON/JSONC object.');
  return value;
}
export function mergeClientConfig(path: string, client: FileClient, endpoint: string) {
  validEndpoint(endpoint);
  const source = existsSync(path) ? readFileSync(path, 'utf8') : '{}\n';
  if (existsSync(path) && lstatSync(path).isSymbolicLink())
    throw new Error('Client configuration is a symlink. Configure it manually.');
  const existing = readConfig(source);
  const key = client === 'vscode' ? 'servers' : 'mcpServers';
  const group = existing[key] ?? {};
  if (!group || Array.isArray(group) || typeof group !== 'object')
    throw new Error(`Invalid ${key} configuration.`);
  const expected = (clientConfig(client, endpoint) as any)[key].jamrelay;
  if (group.jamrelay) {
    if (JSON.stringify(group.jamrelay) === JSON.stringify(expected)) return;
    throw new Error(
      'A different jamrelay registration exists. It was preserved; review it manually before replacing.',
    );
  }
  const result = applyEdits(
    source,
    modify(source, [key, 'jamrelay'], expected, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    }),
  );
  if (JSON.stringify(readConfig(result)[key]?.jamrelay) !== JSON.stringify(expected))
    throw new Error('Client configuration verification failed.');
  if (existsSync(path)) {
    const backup = `${path}.jamrelay-${Date.now()}.bak`;
    copyFileSync(path, backup);
    chmodSync(backup, 0o600);
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, result, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  if (
    JSON.stringify(readConfig(readFileSync(path, 'utf8'))[key]?.jamrelay) !==
    JSON.stringify(expected)
  )
    throw new Error('Written configuration could not be verified. Restore the backup.');
}
export function desktopConfigPath() {
  return process.platform === 'win32'
    ? join(
        process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
        'Claude',
        'claude_desktop_config.json',
      )
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : undefined;
}
export function vscodeUserConfigPath() {
  return process.platform === 'win32'
    ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Code', 'User', 'mcp.json')
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'mcp.json')
      : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Code', 'User', 'mcp.json');
}
export function claudeAddArgs(endpoint: string) {
  return ['mcp', 'add', '--transport', 'http', 'jamrelay', endpoint];
}
export function codexAddArgs(endpoint: string) {
  return ['mcp', 'add', 'jamrelay', '--url', endpoint];
}
function validEndpoint(endpoint: string) {
  const u = new URL(endpoint);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    (!isLoopbackHttp(u.origin) && u.protocol !== 'https:')
  )
    throw new Error(
      'Client endpoint must use local HTTP or public HTTPS without embedded credentials.',
    );
}
async function save(
  client: string,
  endpoint: string,
  status: Status,
  detail: string,
  clientId?: string,
) {
  await changeState((state) => {
    state.clientSetup[client] = { endpoint, status, detail, clientId, updatedAt: Date.now() };
    // guidedClients is retained for compatibility, never used as connection evidence.
  });
}

/** Read-only verification from server-observed OAuth and actual MCP tool-list responses. */
export async function verifyClient(client: InstallClient, endpoint: string) {
  const store = new McpOAuthStore(process.env.MCP_OAUTH_STORE_PATH!);
  const statics = await new StaticOAuthClientRegistry(process.env.MCP_OAUTH_CLIENTS_PATH!).list();
  const candidates = [...(await store.listClients()), ...statics];
  const previous = readState().clientSetup[client];
  const options = candidates.map((c) => ({
    label: `${c.clientName.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')} (${c.clientId})`,
    value: c.clientId,
  }));
  const clientId =
    previous?.clientId && options.some((o) => o.value === previous.clientId)
      ? previous.clientId
      : options.length > 0
        ? await selectOption(options, 0, (i) =>
            menuPanel(
              'Select the OAuth registration to verify',
              options.map((o) => o.label),
              i,
            ),
          )
        : undefined;
  if (!clientId) {
    await save(
      client,
      endpoint,
      'authentication_required',
      'No OAuth registration found. Register the client, open its MCP settings and complete browser authorization.',
    );
    showPanel(
      'Authentication required',
      'Complete OAuth from your client, request its tool list, then run this verification again.',
    );
    return false;
  }
  const grant = await store.getGrant(clientId);
  const authenticated = Boolean(
    grant && !grant.revokedAt && (await store.authenticationEvidence(clientId)),
  );
  let evidence;
  if (authenticated) {
    const db = openSqlite(process.env.JAMRELAY_DB_PATH!, { readOnly: true });
    try {
      evidence = db
        .prepare(
          'SELECT verified_at, tool_count FROM mcp_client_discovery WHERE client_id=? AND verified_at>=?',
        )
        .get(clientId, grant!.updatedAt) as { verified_at: number; tool_count: number } | undefined;
    } catch {
      /* older server has no discovery evidence */
    } finally {
      db.close();
    }
  }
  const online = await probeHealth(new URL(endpoint).origin).catch(() => false);
  const status: Status = !online
    ? 'failed'
    : authenticated
      ? evidence
        ? 'verified'
        : 'authenticated'
      : 'authentication_required';
  const detail = !online
    ? 'Server health could not be verified in this network context.'
    : evidence
      ? `Actual authenticated MCP discovery observed at ${new Date(evidence.verified_at).toISOString()}: ${evidence.tool_count} tools. Music accounts still need separate provider authorization and client grants.`
      : authenticated
        ? 'OAuth access token issued. Ask the client to list MCP tools, then verify again.'
        : 'Finish browser OAuth from the client. Selecting its name does not authenticate it.';
  await save(client, endpoint, status, detail, clientId);
  showPanel(
    statusLabels[status],
    `${detail}\n${endpoint}${previous?.status === 'failed' ? '\nPrevious failure replaced by this check.' : ''}`,
  );
  return status === 'verified';
}

export async function installClient(client: InstallClient, endpoint: string) {
  validEndpoint(endpoint);
  if (client === 'chatgpt' && !publicHttpsEndpoint(endpoint)) {
    const detail =
      'ChatGPT requires publicly reachable HTTPS. Run jamrelay connectivity to configure a tunnel or reverse proxy. Private localhost and LAN endpoints are unreachable from cloud ChatGPT.';
    await save(client, endpoint, 'not_configured', detail);
    showPanel('Not configured', detail);
    return;
  }
  const docker = isContainer();
  let desktopBridge = client === 'claude-desktop' && !publicHttpsEndpoint(endpoint);
  if (client === 'claude-desktop' && !desktopBridge)
    desktopBridge =
      (await choose('Claude Desktop connection method', [
        'Remote connector (public HTTPS)',
        'Local stdio bridge (Node.js required)',
      ])) === 'Local stdio bridge (Node.js required)';
  const command =
    client === 'codex'
      ? `codex mcp add jamrelay --url ${JSON.stringify(endpoint)}`
      : `claude mcp add --transport http jamrelay ${JSON.stringify(endpoint)}`;
  const fragment =
    client === 'cursor' || client === 'vscode' || desktopBridge
      ? JSON.stringify(clientConfig(client as FileClient, endpoint), null, 2)
      : '';
  let path =
    client === 'claude-desktop'
      ? desktopConfigPath()
      : client === 'cursor'
        ? join(homedir(), '.cursor', 'mcp.json')
        : resolve('.vscode', 'mcp.json');
  if (!docker && (client === 'cursor' || client === 'vscode')) {
    const scope = await choose('Configuration scope', [
      'Project directory: ' + process.cwd(),
      'User (default profile)',
    ]);
    path = scope?.startsWith('Project')
      ? resolve(client === 'cursor' ? '.cursor' : '.vscode', 'mcp.json')
      : client === 'cursor'
        ? join(homedir(), '.cursor', 'mcp.json')
        : vscodeUserConfigPath();
  }
  const instructions =
    client === 'codex'
      ? `Codex CLI and Codex Desktop share the user MCP configuration. Run in Windows PowerShell on the host:\n${command}\nThen run: codex mcp list\nIf Codex CLI is unavailable, add this entry to %USERPROFILE%\\.codex\\config.toml:\n[mcp_servers.jamrelay]\nurl = "${endpoint}"\nOpen/restart Codex and approve the JamRelay connection. OAuth authentication happens in the client browser; listing the server only verifies registration.`
      : client === 'claude-code'
        ? `${command}\nThen: claude mcp get jamrelay (registration only). Open Claude Code, run /mcp, authenticate in the browser, then request the JamRelay tool list.`
        : fragment
          ? `${desktopBridge ? 'Claude Desktop Settings → Developer → Edit Config (Windows/macOS)' : docker ? (client === 'cursor' ? '~/.cursor/mcp.json or <project>/.cursor/mcp.json' : '<project>/.vscode/mcp.json or MCP: Open User Configuration') : path}\n${fragment}\nEnable the server in the client, complete OAuth and request the tool list.${desktopBridge ? ' Requires host Node.js/npx; this launches the external pinned mcp-remote stdio bridge, which stores its own OAuth tokens. Restart Claude Desktop after editing.' : ''}`
          : client === 'chatgpt'
            ? `ChatGPT: create a custom MCP app in developer settings using ${endpoint}. Use the documented pre-registered confidential OAuth client. Availability depends on your plan/workspace. No one-click install is available.`
            : client === 'claude-desktop'
              ? `Claude Desktop remote connector: Settings → Connectors → Add custom connector → ${endpoint}. This is the remote connector flow, not a local extension. Availability depends on the client/account. Complete OAuth, then request tools.`
              : `Use Streamable HTTP and OAuth discovery at ${endpoint}. Configure the client manually, authenticate, then request tools.`;
  showPanel(
    'Configuration generated',
    `${docker ? 'Run these commands or edit configuration on your HOST (PowerShell on Windows), outside Docker. This container cannot configure host applications.\n\n' : ''}${instructions}\n\nNo owner password, recovery secret or provider credential belongs in client configuration.`,
  );
  await save(client, endpoint, 'configuration_generated', instructions);
  if (
    !docker &&
    path &&
    (['codex', 'claude-code', 'cursor', 'vscode'].includes(client) || desktopBridge)
  ) {
    let available = true;
    if (client === 'claude-code' || client === 'codex')
      available = await execute(client === 'codex' ? 'codex' : 'claude', ['--version'], {
        timeout: 5000,
      })
        .then(() => true)
        .catch(() => false);
    const operation =
      client === 'claude-code'
        ? command
        : `Merge only the jamrelay entry in ${path}; back up any existing file.`;
    showPanel(
      'Review local configuration change',
      available
        ? operation
        : `${client === 'codex' ? 'Codex CLI' : 'Claude CLI'} was not detected. Install it on the host and run:\n${command}`,
    );
    if (
      available &&
      (await choose('Apply this exact configuration change?', [
        'Keep manual instructions',
        'Apply configuration',
      ])) === 'Apply configuration'
    ) {
      try {
        if (client === 'claude-code' || client === 'codex') {
          const binary = client === 'codex' ? 'codex' : 'claude';
          const checkArgs = client === 'codex' ? ['mcp', 'list'] : ['mcp', 'get', 'jamrelay'];
          const existing = await execute(binary, checkArgs, { timeout: 10000 }).catch(
            () => undefined,
          );
          if (existing?.stdout.includes('jamrelay')) {
            if (!existing.stdout.includes(endpoint))
              throw new Error('A different registration exists; preserved.');
          } else {
            await execute(
              binary,
              client === 'codex' ? codexAddArgs(endpoint) : claudeAddArgs(endpoint),
              {
                timeout: 15000,
              },
            );
          }
          const result = await execute(binary, checkArgs, { timeout: 15000 });
          if (!result.stdout.includes('jamrelay') || !result.stdout.includes(endpoint))
            throw new Error(`${binary} did not report the expected JamRelay MCP URL.`);
        } else mergeClientConfig(path, client as FileClient, endpoint);
        await save(
          client,
          endpoint,
          'configured',
          'Registration/configuration verified; OAuth and tool discovery are pending.',
        );
        showPanel(
          'Configured — authentication required',
          'Open the client MCP settings, complete OAuth in the browser, and request the tool list. Registration alone does not connect music accounts.',
        );
      } catch {
        await save(
          client,
          endpoint,
          'failed',
          'Could not apply/verify configuration. Existing client registration may already exist; use the manual command or JSON fragment.',
        );
        showPanel(
          'Failed',
          `Could not apply/verify configuration. Check existing settings and permissions. Existing registrations were preserved. Review the manual fragment.\n${instructions}`,
        );
      }
    }
  }
  const documentation =
    client === 'codex'
      ? 'https://developers.openai.com/codex/mcp'
      : client === 'claude-code'
        ? 'https://code.claude.com/docs/en/mcp'
        : client === 'claude-desktop'
          ? 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp'
          : client === 'cursor'
            ? 'https://cursor.com/docs/mcp'
            : client === 'vscode'
              ? 'https://code.visualstudio.com/docs/agent-customization/mcp-servers'
              : 'https://github.com/makkiattooo/JamRelay#connecting-an-ai-client';
  showPanel('Client documentation', documentation);
  if (
    !docker &&
    (await choose('Open official connection instructions?', ['Later', 'Open browser'])) ===
      'Open browser'
  )
    await openBrowser(documentation);
  if (
    (await choose('Verify after completing authentication and requesting tools?', [
      'Later',
      'Verify now',
    ])) === 'Verify now'
  )
    await verifyClient(client, endpoint);
}
