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
        runtime: await fetch(`http://127.0.0.1:${process.env.PORT || 5267}/health`, {
          signal: AbortSignal.timeout(500),
        })
          .then((r) => (r.ok ? 'reachable' : 'unhealthy'))
          .catch(() => 'not reachable on loopback'),
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
      if (action === 'list') {
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
      } else if (action === 'revoke' && value) {
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
      ['USAGE', 'NOT_FOUND', 'INVALID_JOB_STATE', 'INVALID_OR_UNCERTAIN_JOB_STATE'].includes(
        error.message,
      )
        ? error.message
        : 'OPERATOR_FAILED';
    output(
      JSON.stringify({
        error: code,
        message: (json ? (s: string) => s : knownMessage)(
          code === 'USAGE'
            ? 'Usage: operator status | connections list | clients list/revoke ID | jobs list/inspect/cancel/resume ID | diagnostics | backup create/list [--json]'
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
