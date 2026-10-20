import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { existsSync, lstatSync, readFileSync, copyFileSync, chmodSync, mkdirSync } from 'node:fs';
import { atomicJson, changeState, readState, type CliState } from './state.js';
import { menuPanel, selectOption, showPanel } from './tui.js';
import { isLoopbackHttp, probeHealth } from './network-context.js';
import { McpOAuthStore, StaticOAuthClientRegistry } from '../mcp/oauth.js';
import { openSqlite } from '../runtime/sqlite.js';

const execute = promisify(execFile);
export type InstallClient =
  'chatgpt' | 'claude-code' | 'claude-desktop' | 'cursor' | 'vscode' | 'generic';
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
export function clientConfig(client: 'cursor' | 'vscode', endpoint: string) {
  return client === 'cursor'
    ? { mcpServers: { jamrelay: { url: endpoint } } }
    : { servers: { jamrelay: { type: 'http', url: endpoint } } };
}
export function mergeClientConfig(path: string, client: 'cursor' | 'vscode', endpoint: string) {
  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    if (lstatSync(path).isSymbolicLink())
      throw new Error('Client configuration is a symlink. Configure it manually.');
    // JSONC is deliberately not rewritten; VS Code can import the displayed fragment manually.
    existing = JSON.parse(readFileSync(path, 'utf8'));
    if (!existing || Array.isArray(existing) || typeof existing !== 'object')
      throw new Error('Client configuration must be a JSON object.');
  }
  const key = client === 'cursor' ? 'mcpServers' : 'servers';
  const group = existing[key] ?? {};
  if (!group || Array.isArray(group) || typeof group !== 'object')
    throw new Error(`Invalid ${key} configuration. Use the manual fragment.`);
  if (existsSync(path)) {
    const backup = `${path}.jamrelay-${Date.now()}.bak`;
    copyFileSync(path, backup);
    chmodSync(backup, 0o600);
  }
  mkdirSync(dirname(path), { recursive: true });
  atomicJson(path, {
    ...existing,
    [key]: {
      ...group,
      jamrelay: client === 'cursor' ? { url: endpoint } : { type: 'http', url: endpoint },
    },
  });
  const written = JSON.parse(readFileSync(path, 'utf8'));
  if (written[key]?.jamrelay?.url !== endpoint)
    throw new Error('Client configuration verification failed. Restore the .bak file.');
}
export function claudeAddArgs(endpoint: string) {
  return ['mcp', 'add', '--transport', 'http', 'jamrelay', endpoint];
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
  const candidates = [...(await store.listClients()), ...statics].filter(
    (c) =>
      client === 'generic' ||
      (client === 'claude-code'
        ? /claude.*code/i
        : client === 'claude-desktop'
          ? /claude(?!.*code)/i
          : new RegExp(client, 'i')
      ).test(c.clientName),
  );
  const previous = readState().clientSetup[client];
  const options = candidates.map((c) => ({
    label: `${c.clientName} (${c.clientId})`,
    value: c.clientId,
  }));
  const clientId =
    options.length === 1
      ? options[0].value
      : options.length > 1
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
      'No matching OAuth registration found. Register the client, open its MCP settings and complete browser authorization.',
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
  if (['chatgpt', 'claude-desktop'].includes(client) && isLoopbackHttp(new URL(endpoint).origin)) {
    const detail =
      'This cloud connector requires public HTTPS. Run jamrelay connectivity to configure a tunnel or your reverse proxy. Claude Desktop remote Connectors are distinct from local extensions; JamRelay does not install a local extension.';
    await save(client, endpoint, 'not_configured', detail);
    showPanel('Not configured', detail);
    return;
  }
  const docker = process.env.JAMRELAY_INSTALL_MODE === 'docker';
  const command = `claude mcp add --transport http jamrelay ${JSON.stringify(endpoint)}`;
  const fragment =
    client === 'cursor' || client === 'vscode'
      ? JSON.stringify(clientConfig(client, endpoint), null, 2)
      : '';
  const path =
    client === 'cursor' ? join(homedir(), '.cursor', 'mcp.json') : resolve('.vscode', 'mcp.json');
  const instructions =
    client === 'claude-code'
      ? `${command}\nThen: claude mcp get jamrelay (registration only). Open Claude Code, run /mcp, authenticate in the browser, then request the JamRelay tool list.`
      : fragment
        ? `${client === 'cursor' ? '~/.cursor/mcp.json' : '<your-project>/.vscode/mcp.json'}\n${fragment}\nEnable the server in the client, complete OAuth and request the tool list.`
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
  if (!docker && ['claude-code', 'cursor', 'vscode'].includes(client)) {
    let available = true;
    if (client === 'claude-code')
      available = await execute('claude', ['--version'], { timeout: 5000 })
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
        : `Claude CLI was not detected. Install it on the host and run:\n${command}`,
    );
    if (
      available &&
      (await choose('Apply this exact configuration change?', [
        'Keep manual instructions',
        'Apply configuration',
      ])) === 'Apply configuration'
    ) {
      try {
        if (client === 'claude-code') {
          await execute('claude', claudeAddArgs(endpoint), { timeout: 15000 });
          const result = await execute('claude', ['mcp', 'get', 'jamrelay'], { timeout: 15000 });
          if (!result.stdout.includes(endpoint))
            throw new Error(
              'Claude registration did not return the expected MCP URL. Inspect claude mcp get jamrelay.',
            );
        } else mergeClientConfig(path, client as 'cursor' | 'vscode', endpoint);
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
          `Could not apply/verify configuration. Check existing settings and permissions. JSONC files require manual editing.\n${instructions}`,
        );
      }
    }
  }
  if (
    (await choose('Verify after completing authentication and requesting tools?', [
      'Later',
      'Verify now',
    ])) === 'Verify now'
  )
    await verifyClient(client, endpoint);
}
