import { selectPermissions, parsePolicy, parseTools } from './cli/permissions.js';
import { probeHealth } from './cli/network-context.js';
import { effectiveBaseUrl } from './config.js';
import { installationPaths } from './runtime/installation.js';
import { knownMessage, translator, currentLanguage } from './cli/i18n/index.js';
import { APP_VERSION } from './version.js';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  initializeDatabase,
  closeDatabase,
  getDatabase,
  getDatabasePath,
  getDatabaseStatus,
} from './db/database.js';
import { listJobs, getJob, cancelJob, resumeJob, listStateDiagnostics } from './db/jobs.js';
import { McpOAuthStore } from './mcp/oauth.js';
import { EncryptedCredentialStore } from './providers/credential-store.js';
import { createApplicationBackup, listApplicationBackups } from './runtime/backup.js';

// Never serialize user job payloads, OAuth records or arbitrary metadata to the terminal.
const safeJob = (job: any) =>
  job && {
    id: job.id,
    type: job.type,
    status: job.status,
    provider: job.provider,
    connection_id: job.connectionId,
    attempts: job.attempts,
    max_attempts: job.maxAttempts,
    run_after: job.runAfter,
    commit_state: job.commitState,
    manual_review: Boolean(job.manualReview || job.payload?.manual_review),
    last_error_code: job.lastErrorCode,
    counts: job.counts,
  };
export async function runOperator(
  args: string[],
  output: (s: string) => void = console.log,
): Promise<number> {
  const json = args.includes('--json');
  const words = args.filter((x) => x !== '--json');
  const [group, action, value] = words;
  const dataDir = resolve(process.env.JAMRELAY_DATA_DIR?.trim() || 'data');
  const oauthPath = process.env.MCP_OAUTH_STORE_PATH || join(dataDir, 'mcp-oauth.json');
  const credentialPath =
    process.env.PROVIDER_CREDENTIAL_STORE_PATH || join(dataDir, 'provider-credentials.json');
  try {
    initializeDatabase();
    let result: unknown;
    if (group === 'status')
      result = {
        version: APP_VERSION,
        configuration: installationPaths().config,
        runtime: await probeHealth(effectiveBaseUrl(process.env))
          .then((ok) => (ok ? 'reachable' : 'unhealthy'))
          .catch(() => 'not reachable in this network context'),
        database: getDatabaseStatus(),
        providers_configured: [
          'SPOTIFY_CLIENT_ID',
          'SOUNDCLOUD_CLIENT_ID',
          'APPLE_MUSIC_TEAM_ID',
          'YOUTUBE_CLIENT_ID',
        ]
          .filter((k) => Boolean(process.env[k]))
          .map((k) => k.split('_CLIENT_ID')[0].toLowerCase()),
      };
    else if (group === 'diagnostics') result = listStateDiagnostics();
    else if (group === 'connections' && action === 'list') {
      const records = await new EncryptedCredentialStore(credentialPath).list();
      result = records.map((r) => ({
        connection_id: r.connectionId,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      }));
    } else if (group === 'clients') {
      const store = new McpOAuthStore(oauthPath);
      if (action === 'list' || action === 'show') {
        let statics: any = [];
        try {
          const raw = JSON.parse(
            await readFile(
              process.env.MCP_OAUTH_CLIENTS_PATH || join(dataDir, 'mcp-oauth-clients.json'),
              'utf8',
            ),
          );
          statics = Array.isArray(raw) ? raw : raw.clients;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
        result = {
          clients: [
            ...(await store.listClients()),
            ...(process.env.MCP_API_KEY
              ? [{ clientId: 'api-key', clientName: 'Legacy shared API key', source: 'local' }]
              : []),
            ...statics.map((c: any) => ({
              clientId: c.clientId,
              clientName: c.clientName,
              source: 'static',
            })),
          ],
          grants: (await store.listGrants()).map((g) => ({
            ...g,
            revoked: Boolean(
              g.revokedAt ||
              getDatabase()
                .prepare(
                  'SELECT 1 FROM operator_client_revocations WHERE client_id=? AND revoked_at>=?',
                )
                .get(g.clientId, g.updatedAt),
            ),
          })),
        };
        const summary = result as { clients: any[]; grants: any[] };
        summary.clients = await Promise.all(
          summary.clients
            .filter((c) => action !== 'show' || c.clientId === value)
            .map(async (c) => {
              const grant = summary.grants.find((g) => g.clientId === c.clientId);
              const authenticated = await store.authenticationEvidence(c.clientId);
              const discovery = getDatabase()
                .prepare(
                  'SELECT verified_at, tool_count FROM mcp_client_discovery WHERE client_id=?',
                )
                .get(c.clientId) as { verified_at: number; tool_count: number } | undefined;
              return {
                ...c,
                grant,
                authenticated,
                discovery: discovery ?? null,
                verified: Boolean(
                  authenticated &&
                  grant &&
                  !grant.revoked &&
                  discovery &&
                  discovery.verified_at >= grant.updatedAt,
                ),
              };
            }),
        );
        if (
          action === 'show' &&
          !summary.clients.length &&
          !summary.grants.some((g) => g.clientId === value)
        )
          throw new Error('NOT_FOUND');
        if (action === 'show') summary.grants = summary.grants.filter((g) => g.clientId === value);
      } else if (action === 'policy') {
        if (value === 'set') {
          const scopes = words.indexOf('--permissions');
          const tools = words.indexOf('--tools');
          if (scopes < 0 || words[scopes + 1] === undefined) throw new Error('USAGE');
          await store.setDefaults(
            parsePolicy(words[scopes + 1], tools < 0 ? undefined : words[tools + 1]),
          );
        }
        result = {
          defaults: await store.defaults(),
          effect:
            'Initial consent defaults only. Existing grants are unchanged; every new connection still requires owner approval.',
        };
      } else if (action === 'permissions') {
        const editing = value === 'set';
        const clientId = editing ? words[3] : value;
        if (!clientId) throw new Error('USAGE');
        const grant = await store.getGrant(clientId);
        if (!grant || grant.revokedAt) throw new Error('NOT_FOUND');
        if (!editing) result = grant;
        else {
          const flag = (name: string) => {
            const index = words.indexOf(name);
            return index < 0 ? undefined : words[index + 1];
          };
          const records = await new EncryptedCredentialStore(credentialPath).list();
          const accounts = [
            ...new Set([...grant.connectionIds, ...records.map((r) => r.connectionId)]),
          ];
          let change;
          if (
            flag('--permissions') !== undefined ||
            flag('--connections') !== undefined ||
            flag('--tools') !== undefined
          ) {
            change = {
              ...parsePolicy(flag('--permissions') ?? grant.permissions.join(',')),
              connectionIds:
                flag('--connections') === undefined
                  ? grant.connectionIds
                  : flag('--connections')!.split(',').filter(Boolean),
              tools: flag('--tools') === undefined ? grant.tools : parseTools(flag('--tools')!),
            };
          } else {
            if (!process.stdin.isTTY) throw new Error('USAGE');
            change = await selectPermissions(
              grant.permissions,
              accounts,
              grant.connectionIds,
              grant.tools,
            );
          }
          if (change.connectionIds.some((id) => !accounts.includes(id)))
            throw new Error('INVALID_CONNECTION');
          await store.updateGrant(clientId, change.connectionIds, change.permissions, change.tools);
          result = {
            grant: await store.getGrant(clientId),
            effect:
              'Effective immediately for existing tokens and queued work. Refresh the client tool list; no server restart or new login is required.',
          };
        }
      } else if (action === 'revoke' && value) {
        await store.revokeGrant(value);
        getDatabase()
          .prepare(
            'INSERT INTO operator_client_revocations VALUES (?,?) ON CONFLICT(client_id) DO UPDATE SET revoked_at=excluded.revoked_at',
          )
          .run(value, Date.now());
        result = { revoked: true, client_id: value };
      } else throw new Error('USAGE');
    } else if (group === 'jobs') {
      if (action === 'list') result = listJobs().map(safeJob);
      else {
        const id = Number(value);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('USAGE');
        const job = getJob(id);
        if (!job) throw new Error('NOT_FOUND');
        if (action === 'inspect') result = safeJob(job);
        else if (action === 'cancel') {
          if (!cancelJob(id)) throw new Error('INVALID_JOB_STATE');
          result = safeJob(getJob(id));
        } else if (action === 'resume') {
          if (!resumeJob(id)) throw new Error('INVALID_OR_UNCERTAIN_JOB_STATE');
          result = safeJob(getJob(id));
        } else throw new Error('USAGE');
      }
    } else if (group === 'backup') {
      const base = join(dataDir, 'backups');
      if (action === 'list') result = await listApplicationBackups(base);
      else if (action === 'create')
        result = await createApplicationBackup({
          databasePath: getDatabasePath(),
          outputDir: join(base, new Date().toISOString().replace(/[.:]/g, '-')),
          credentialFiles: [
            { name: 'provider-credentials.json', path: credentialPath },
            { name: 'mcp-oauth.json', path: oauthPath },
            {
              name: 'mcp-oauth-clients.json',
              path: process.env.MCP_OAUTH_CLIENTS_PATH || join(dataDir, 'mcp-oauth-clients.json'),
            },
          ],
        });
      else throw new Error('USAGE');
    } else throw new Error('USAGE');
    if (!json && group === 'status') {
      const t = translator(currentLanguage());
      const status = result as any;
      output(
        `JamRelay\n${t('Version')}: ${status.version}\n${t('Configuration')}: ${status.configuration}\n${t('Runtime')}: ${status.runtime}\n${t('Database')}: ${JSON.stringify(status.database)}\n${t('Providers')}: ${status.providers_configured.join(', ') || t('none')}`,
      );
    } else output(JSON.stringify(result, null, json ? 0 : 2));
    return 0;
  } catch (error) {
    const code =
      error instanceof Error &&
      [
        'USAGE',
        'NOT_FOUND',
        'INVALID_PERMISSION',
        'INVALID_TOOL',
        'INVALID_CONNECTION',
        'CANCELLED',
        'INVALID_JOB_STATE',
        'INVALID_OR_UNCERTAIN_JOB_STATE',
      ].includes(error.message)
        ? error.message
        : 'OPERATOR_FAILED';
    output(
      JSON.stringify({
        error: code,
        message: (json ? (s: string) => s : knownMessage)(
          code === 'USAGE'
            ? 'Usage: operator status | connections list | clients list/show ID/permissions [set] ID/revoke ID | clients policy [set --permissions CSV --tools all/CSV] | jobs list/inspect/cancel/resume ID | diagnostics | backup create/list [--json]'
            : 'Operation failed; verify configuration and local file permissions. No secrets are printed.',
        ),
      }),
    );
    return code === 'USAGE' ? 2 : 1;
  } finally {
    closeDatabase();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await runOperator(process.argv.slice(2));
