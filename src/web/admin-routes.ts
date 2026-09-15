import express from 'express';
import type { Router } from 'express';
import {
  adminLoginPage,
  adminConfirmationPage,
  adminPageHeaders,
  authResultPage,
  connectionDetailPage,
  connectionsPage,
  clientsPage,
  clientDetailPage,
  dashboardPage,
  providerChooserPage,
  systemStatusPage,
  adminListPage,
  adminJobDetailPage,
  escapeHtml,
  withAdminFlash,
} from './ui.js';
import { APP_VERSION } from '../version.js';
import { getDatabaseStatus, isDatabaseInitialized } from '../db/database.js';
import { getJob, listJobs, setJobStatus } from '../db/jobs.js';
import { getRecentApiErrors } from '../db/state.js';
import { listStateDiagnostics } from '../db/jobs.js';
import { REQUIRED_TOOL_NAMES, SMART_PLAYLIST_TOOL_NAMES, toolsetIncludes } from '../mcp/tools.js';
import { getToolSecurityMetadata } from '../mcp/tool-manifest.js';
import { createApplicationBackup, listApplicationBackups } from '../runtime/backup.js';

export type AdminRouteDependencies = Record<string, any>;

export function registerAdminRoutes(router: Router, deps: AdminRouteDependencies) {
  const {
    ownerSessions,
    owner,
    csrf,
    cfg,
    registry,
    providerSummary,
    oauthStore,
    auth,
    soundCloudAuth,
    youtubeAuth,
    appleMusicAuth,
    appleMusicAdapter,
    updateConnectionSettings,
    backupOptions,
  } = deps;

  router.get('/login', (_req, res) =>
    res.type('html').set(adminPageHeaders).send(adminLoginPage()),
  );
  router.post('/login', express.urlencoded({ extended: false }), (req, res) => {
    const session = ownerSessions.authenticate(
      String(req.body?.owner_secret ?? ''),
      cfg.MCP_OAUTH_OWNER_SECRET ?? '',
    );
    if (!session)
      return res
        .status(401)
        .type('html')
        .set(adminPageHeaders)
        .send(adminLoginPage('The owner secret was not accepted. Try again.'));
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return res
      .setHeader(
        'Set-Cookie',
        `jamrelay_owner=${session.token}; HttpOnly; SameSite=Lax; Max-Age=1800${secure}`,
      )
      .redirect('/admin');
  });
  router.post('/logout', express.urlencoded({ extended: false }), (req, res) => {
    const session = owner(req);
    if (!session)
      return res
        .status(401)
        .type('html')
        .set(adminPageHeaders)
        .send(authResultPage('', false, 'Your owner session is no longer valid.'));
    if (!csrf(req) && req.body?.csrf_token !== session.csrf)
      return res
        .type('html')
        .set(adminPageHeaders)
        .send(
          adminConfirmationPage(
            'Sign out',
            'Confirm signing out of the owner session.',
            '/admin/logout',
            session.csrf,
          ),
        );
    ownerSessions.revoke(session.token);
    return res
      .setHeader('Set-Cookie', 'jamrelay_owner=; HttpOnly; SameSite=Lax; Max-Age=0')
      .redirect('/admin/login');
  });
  router.get('/', async (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    // The overview is a local control-plane page. Do not wake provider APIs just
    // to render a dashboard card; connectivity is inspected on Connections.
    const connections = registry.listConnections();
    const jobs = isDatabaseInitialized() ? listJobs(0, 100) : [];
    const recentErrors = isDatabaseInitialized() ? getRecentApiErrors(100) : [];
    const diagnostics = isDatabaseInitialized()
      ? (listStateDiagnostics() as any)
      : { activeRateLimits: [] };
    const recentJobs = jobs
      .filter((job: any) => ['pending', 'waiting', 'running', 'failed'].includes(job.status))
      .slice(0, 8);
    return res
      .type('html')
      .set(adminPageHeaders)
      .send(
        dashboardPage({
          connections: connections.length,
          connected: connections.filter((x: any) => x.connected !== false).length,
          clients: (await oauthStore.listGrants()).length,
          schema: getDatabaseStatus().schemaState,
          activeJobs: jobs.filter((job: any) =>
            ['pending', 'waiting', 'running'].includes(job.status),
          ).length,
          failedJobs: jobs.filter((job: any) => job.status === 'failed').length,
          recentErrors: recentErrors.length,
          activeRateLimits: diagnostics.activeRateLimits?.length ?? 0,
          version: APP_VERSION,
          toolset: cfg.JAMRELAY_TOOLSET,
          providerOverview: connections,
          preferred: registry.getPreferred(),
          recentJobs: recentJobs.map((job: any) => ({
            id: job.id,
            type: job.type,
            status: job.status,
            updatedAt: job.updatedAt,
          })),
          recentFailures: recentErrors.slice(0, 8).map((error: any) => ({
            provider: error.provider,
            connectionId: error.connectionId,
            statusCode: error.statusCode,
            reason: error.reason,
            occurrences: error.occurrences,
          })),
          warnings: [
            ...(getDatabaseStatus().schemaState !== 'current'
              ? ['Database schema requires attention.']
              : []),
            ...(diagnostics.activeRateLimits?.length
              ? ['At least one provider rate limit is active.']
              : []),
            ...(jobs.some((job: any) => job.status === 'failed')
              ? ['Failed durable jobs require review.']
              : []),
            ...(recentErrors.length ? ['Unresolved provider API errors are present.'] : []),
            ...(!connections.length ? ['No provider connection is configured.'] : []),
          ],
        }),
      );
  });
  router.get('/connections', async (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    const filters = {
      provider: typeof req.query.provider === 'string' ? req.query.provider : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      role: typeof req.query.role === 'string' ? req.query.role : undefined,
    };
    const preferred = registry.getPreferred();
    const summaries = (await providerSummary()).filter(
      (connection: any) =>
        (!filters.provider || connection.provider === filters.provider) &&
        (!filters.status || connection.status === filters.status) &&
        (!filters.role ||
          (filters.role === 'read' ? preferred.read : preferred.write) === connection.connectionId),
    );
    return res
      .type('html')
      .set(adminPageHeaders)
      .send(
        withAdminFlash(
          connectionsPage(summaries as any, preferred, filters),
          owner(req)!.token && ownerSessions.consumeFlash(owner(req)!.token),
        ),
      );
  });
  router.get('/connections/:connectionId', (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    const connection = registry.getConnection(req.params.connectionId);
    return connection
      ? res
          .type('html')
          .set(adminPageHeaders)
          .send(
            withAdminFlash(
              connectionDetailPage(
                connection.summary,
                registry.getPreferred(),
                owner(req)!.csrf,
              ).replace(
                '</main>',
                `<section class="section"><div class="section-title">Capabilities</div>${
                  Object.entries(connection.summary.capabilities.playlistOperations ?? {})
                    .map(
                      ([operation, supported]) =>
                        `<div class="row"><span>Playlist ${escapeHtml(operation)}</span><span>${supported ? 'Supported' : 'Unavailable'}</span></div>`,
                    )
                    .join('') ||
                  '<div class="empty">No granular playlist operations reported.</div>'
                }</section><section class="section"><div class="section-title">Settings</div><form method="post" action="/admin/connections/${encodeURIComponent(req.params.connectionId)}/settings"><label for="display-name">Display name</label><input id="display-name" name="display_name" maxlength="120" value="${escapeHtml(connection.summary.displayName ?? '')}"><input type="hidden" name="csrf_token" value="${escapeHtml(owner(req)!.csrf)}"><label><input type="checkbox" name="preferred_read" value="true"${registry.getPreferred().read === req.params.connectionId ? ' checked' : ''}> Set as preferred read connection</label><label><input type="checkbox" name="preferred_write" value="true"${registry.getPreferred().write === req.params.connectionId ? ' checked' : ''}> Set as preferred write connection</label><button class="primary" type="submit">Save settings</button></form></section></main>`,
              ),
              ownerSessions.consumeFlash(owner(req)!.token),
            ),
          )
      : res
          .status(404)
          .type('html')
          .set(adminPageHeaders)
          .send(authResultPage('', false, 'Connection not found.'));
  });
  router.post(
    '/connections/:connectionId/disconnect',
    express.urlencoded({ extended: false }),
    (req, res) => {
      if (!owner(req) || (!csrf(req) && req.body?.csrf_token !== owner(req)?.csrf))
        return res
          .status(403)
          .type('html')
          .set(adminPageHeaders)
          .send(authResultPage('', false, 'Your owner session or CSRF token is no longer valid.'));
      if (req.body?.confirmed !== 'yes')
        return res
          .type('html')
          .set(adminPageHeaders)
          .send(
            adminConfirmationPage(
              'Disconnect connection',
              'The connection will be removed from the active registry. Local state is retained.',
              `/admin/connections/${encodeURIComponent(req.params.connectionId)}/disconnect`,
              owner(req)!.csrf,
            ),
          );
      registry.unregister(req.params.connectionId);
      ownerSessions.setFlash(owner(req)!.token, 'Provider connection disconnected.');
      return res.redirect('/admin/connections');
    },
  );
  router.get('/providers', (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    return res
      .type('html')
      .set(adminPageHeaders)
      .send(
        withAdminFlash(
          providerChooserPage(
            [
              { id: 'spotify', label: 'Spotify', configured: Boolean(auth) },
              { id: 'soundcloud', label: 'SoundCloud', configured: Boolean(soundCloudAuth) },
              { id: 'youtube', label: 'YouTube', configured: Boolean(youtubeAuth) },
              { id: 'apple-music', label: 'Apple Music', configured: Boolean(appleMusicAuth) },
            ],
            owner(req)!.csrf,
            '',
          ),
          owner(req)!.token && ownerSessions.consumeFlash(owner(req)!.token),
        ),
      );
  });
  router.post(
    '/providers/apple-music/user-token',
    express.urlencoded({ extended: false }),
    async (req, res) => {
      const session = owner(req);
      if (!session || req.body?.csrf_token !== session.csrf)
        return res
          .status(403)
          .type('html')
          .set(adminPageHeaders)
          .send(authResultPage('', false, 'Your owner session or CSRF token is no longer valid.'));
      if (!appleMusicAuth)
        return res
          .status(503)
          .type('html')
          .set(adminPageHeaders)
          .send(authResultPage('apple-music', false, 'Apple Music is not configured.'));
      try {
        await appleMusicAuth.setMusicUserToken(String(req.body?.music_user_token ?? ''));
        await appleMusicAdapter?.refreshCapabilities();
        ownerSessions.setFlash(session.token, 'Apple Music User Token saved.');
        return res.redirect('/admin/providers');
      } catch {
        return res
          .status(400)
          .type('html')
          .set(adminPageHeaders)
          .send(authResultPage('apple-music', false, 'The Apple Music User Token was invalid.'));
      }
    },
  );
  router.get('/clients', async (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    const grants = await oauthStore.listGrants();
    return res
      .type('html')
      .set(adminPageHeaders)
      .send(
        withAdminFlash(
          clientsPage(grants as any),
          owner(req)!.token && ownerSessions.consumeFlash(owner(req)!.token),
        ),
      );
  });
  router.get('/clients/:clientId', async (req, res) => {
    const session = owner(req);
    if (!session) return res.redirect('/admin/login');
    const grant = await oauthStore.getGrant(req.params.clientId);
    if (!grant)
      return res
        .status(404)
        .type('html')
        .set(adminPageHeaders)
        .send(authResultPage('', false, 'MCP client grant not found.'));
    return res
      .type('html')
      .set(adminPageHeaders)
      .send(
        withAdminFlash(
          clientDetailPage(grant as any, registry.listConnections(), session.csrf),
          ownerSessions.consumeFlash(session.token),
        ),
      );
  });
  router.post('/clients/:clientId', express.urlencoded({ extended: false }), async (req, res) => {
    const session = owner(req);
    if (!session || req.body?.csrf_token !== session.csrf)
      return res
        .status(403)
        .type('html')
        .set(adminPageHeaders)
        .send(authResultPage('', false, 'Your owner session or CSRF token is no longer valid.'));
    const list = (value: unknown) =>
      (Array.isArray(value) ? value : value ? [value] : []).map(String);
    const grant = await oauthStore.getGrant(req.params.clientId);
    if (!grant) return res.status(404).redirect('/admin/clients');
    await oauthStore.updateGrant(
      req.params.clientId,
      list(req.body.connection_ids),
      list(req.body.permissions),
    );
    ownerSessions.setFlash(session.token, 'MCP client access updated.');
    return res.redirect(`/admin/clients/${encodeURIComponent(req.params.clientId)}`);
  });
  router.post(
    '/clients/:clientId/revoke',
    express.urlencoded({ extended: false }),
    async (req, res) => {
      const session = owner(req);
      if (!session || req.body?.csrf_token !== session.csrf)
        return res
          .status(403)
          .type('html')
          .set(adminPageHeaders)
          .send(authResultPage('', false, 'Your owner session or CSRF token is no longer valid.'));
      if (req.body?.confirmed !== 'yes')
        return res
          .type('html')
          .set(adminPageHeaders)
          .send(
            adminConfirmationPage(
              'Revoke MCP client',
              'This invalidates the client grant and its existing access tokens.',
              `/admin/clients/${encodeURIComponent(req.params.clientId)}/revoke`,
              session.csrf,
            ),
          );
      await oauthStore.revokeGrant(req.params.clientId);
      ownerSessions.setFlash(session.token, 'MCP client access revoked.');
      return res.redirect('/admin/clients');
    },
  );
  router.get('/status', async (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    const dbStatus = getDatabaseStatus();
    return res
      .type('html')
      .set(adminPageHeaders)
      .send(
        systemStatusPage({
          version: APP_VERSION,
          schema: dbStatus.schemaState,
          currentVersion: dbStatus.currentVersion ?? undefined,
          expectedVersion: dbStatus.expectedVersion ?? undefined,
          authMode: cfg.MCP_AUTH_MODE,
          ownerAuth: cfg.MCP_OAUTH_OWNER_SECRET ? 'configured' : 'not configured',
          oauth: cfg.MCP_OAUTH_OWNER_SECRET ? 'configured' : 'not configured',
          dcr: cfg.MCP_OAUTH_DCR_ENABLED === 'true' ? 'enabled' : 'disabled',
          providers:
            registry
              .listConnections()
              .map(
                (x: any) =>
                  `${x.provider}:${x.connected === false ? 'disconnected' : 'configured'}`,
              )
              .join(', ') || 'none',
          publicBaseUrl: cfg.PUBLIC_BASE_URL,
          runtime: [
            `Node.js: ${process.version}`,
            `Uptime: ${Math.floor(process.uptime())} seconds`,
            `Host: ${cfg.HOST}`,
            `Port: ${cfg.PORT}`,
            `Toolset: ${cfg.JAMRELAY_TOOLSET}`,
            `Trust proxy: ${cfg.TRUST_PROXY}`,
            `Playlist read concurrency: ${cfg.PLAYLIST_READ_CONCURRENCY}`,
          ],
        }),
      );
  });
  router.get('/jobs', (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    const requestedStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
    const validStatus = [
      'pending',
      'waiting',
      'running',
      'completed',
      'failed',
      'cancelled',
    ].includes(requestedStatus ?? '')
      ? (requestedStatus as any)
      : undefined;
    const providerFilter = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    const connectionFilter =
      typeof req.query.connection === 'string' ? req.query.connection : undefined;
    const typeFilter = typeof req.query.type === 'string' ? req.query.type : undefined;
    const rows = isDatabaseInitialized()
      ? listJobs(0, 50, {
          status: validStatus,
          provider: providerFilter,
          connectionId: connectionFilter,
          type: typeFilter,
        }).map((job: any) => [
          `<a href="/admin/jobs/${encodeURIComponent(job.id)}"><code>${escapeHtml(job.id)}</code></a>`,
          escapeHtml(job.type),
          `<span class="badge ${job.status === 'failed' ? 'danger' : job.status === 'running' ? 'ok' : 'warn'}">${escapeHtml(job.status)}</span>`,
          escapeHtml(job.payload?.provider ?? '—'),
          escapeHtml(job.payload?.connection_id ?? '—'),
          escapeHtml(job.payload?.phase ?? '—'),
          escapeHtml(`${job.attempts} / ${job.maxAttempts}`),
          escapeHtml(job.updatedAt ? new Date(job.updatedAt).toISOString() : '—'),
        ])
      : [];
    return res
      .type('html')
      .set(adminPageHeaders)
      .send(
        withAdminFlash(
          adminListPage(
            'Jobs',
            'Durable work and recovery state. Filters: ?status=, ?provider=, ?connection= and ?type=.',
            'jobs',
            ['ID', 'Type', 'Status', 'Provider', 'Connection', 'Phase', 'Attempts', 'Updated'],
            rows,
            'No background jobs have been created yet.',
          ),
          owner(req)!.token && ownerSessions.consumeFlash(owner(req)!.token),
        ),
      );
  });
  router.get('/jobs/:jobId', (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    if (!isDatabaseInitialized())
      return res
        .status(503)
        .type('html')
        .set(adminPageHeaders)
        .send(authResultPage('', false, 'The State DB is not available.'));
    const id = Number(req.params.jobId);
    const requestedOffset =
      typeof req.query.offset === 'string' && /^\d+$/.test(req.query.offset)
        ? Math.min(100_000, Number(req.query.offset))
        : 0;
    const job = Number.isSafeInteger(id) ? getJob(id, requestedOffset, 25) : null;
    if (!job)
      return res
        .status(404)
        .type('html')
        .set(adminPageHeaders)
        .send(authResultPage('', false, 'Job not found.'));
    return res
      .type('html')
      .set(adminPageHeaders)
      .send(
        withAdminFlash(
          adminJobDetailPage(
            {
              id: job.id,
              type: job.type,
              status: job.status,
              attempts: job.attempts,
              maxAttempts: job.maxAttempts,
              runAfter: job.runAfter,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
              startedAt: job.startedAt,
              completedAt: job.completedAt,
              provider: job.payload?.provider,
              connectionId: job.payload?.connection_id,
              phase: job.payload?.phase,
              manualReview: job.payload?.manual_review === true,
              manualReviewReason: job.payload?.manual_review_reason,
              lastErrorId: job.lastErrorId,
              items: (job.items ?? []).map((item: any) => ({
                id: Number(item.id),
                position: Number(item.position),
                status: String(item.status),
                errorId: item.errorId == null ? null : Number(item.errorId),
              })),
              itemOffset: requestedOffset,
              counts: (job.counts ?? []).map((entry: any) => ({
                status: String(entry.status),
                count: Number(entry.count),
              })),
            },
            owner(req)!.csrf,
          ),
          owner(req)!.token && ownerSessions.consumeFlash(owner(req)!.token),
        ),
      );
  });
  router.post('/jobs/:jobId/cancel', express.urlencoded({ extended: false }), (req, res) => {
    const session = owner(req);
    const id = Number(req.params.jobId);
    if (!session || req.body?.csrf_token !== session.csrf)
      return res
        .status(403)
        .type('html')
        .set(adminPageHeaders)
        .send(authResultPage('', false, 'Your owner session or CSRF token is no longer valid.'));
    if (req.body?.confirmed !== 'yes')
      return res
        .type('html')
        .set(adminPageHeaders)
        .send(
          adminConfirmationPage(
            'Cancel job',
            'The job will stop being eligible for processing.',
            `/admin/jobs/${encodeURIComponent(id)}/cancel`,
            session.csrf,
          ),
        );
    if (!isDatabaseInitialized() || !Number.isSafeInteger(id) || !getJob(id, 0, 1))
      return res.status(404).redirect('/admin/jobs');
    setJobStatus(id, 'cancelled');
    ownerSessions.setFlash(session.token, 'Job cancelled.');
    return res.redirect(`/admin/jobs/${encodeURIComponent(id)}`);
  });
  router.post('/jobs/:jobId/resume', express.urlencoded({ extended: false }), (req, res) => {
    const session = owner(req);
    const id = Number(req.params.jobId);
    if (!session || req.body?.csrf_token !== session.csrf)
      return res
        .status(403)
        .type('html')
        .set(adminPageHeaders)
        .send(authResultPage('', false, 'Your owner session or CSRF token is no longer valid.'));
    const job = isDatabaseInitialized() && Number.isSafeInteger(id) ? getJob(id, 0, 1) : null;
    if (!job) return res.status(404).redirect('/admin/jobs');
    if (!['failed', 'cancelled'].includes(job.status))
      return res.redirect(`/admin/jobs/${encodeURIComponent(id)}`);
    setJobStatus(id, 'pending', Date.now());
    ownerSessions.setFlash(session.token, 'Job resumed.');
    return res.redirect(`/admin/jobs/${encodeURIComponent(id)}`);
  });
  router.get('/diagnostics', (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    const providerFilter = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    const statusFilter =
      typeof req.query.status === 'string' && /^\d{3}$/.test(req.query.status)
        ? Number(req.query.status)
        : undefined;
    const unresolvedOnly = req.query.unresolved === 'true';
    const errors = isDatabaseInitialized()
      ? getRecentApiErrors(50, providerFilter, statusFilter, unresolvedOnly)
      : [];
    const activeRateLimits = isDatabaseInitialized()
      ? ((listStateDiagnostics(providerFilter) as any).activeRateLimits ?? [])
      : [];
    const diagnosticsSummary = isDatabaseInitialized()
      ? `<section class="section"><div class="section-title">State overview</div><div class="grid"><div class="card"><div class="stat-label">Indexed tracks</div><div class="stat-value">${escapeHtml((listStateDiagnostics(providerFilter) as any).tracks ?? 0)}</div></div><div class="card"><div class="stat-label">Aliases</div><div class="stat-value">${escapeHtml((listStateDiagnostics(providerFilter) as any).aliases ?? 0)}</div></div><div class="card"><div class="stat-label">Unresolved errors</div><div class="stat-value">${escapeHtml((listStateDiagnostics(providerFilter) as any).unresolvedErrors ?? 0)}</div></div></div></section>`
      : '';
    const rows = errors.map((error: any) => [
      escapeHtml(error.provider),
      escapeHtml(error.connectionId ?? '—'),
      `<code>${escapeHtml(error.endpoint ?? '—')}</code>`,
      escapeHtml(error.statusCode ?? '—'),
      escapeHtml(error.reason ?? '—'),
      escapeHtml(error.occurrences ?? 1),
    ]);
    return res
      .type('html')
      .set(adminPageHeaders)
      .send(
        adminListPage(
          'Diagnostics',
          'Sanitized State DB diagnostics and provider failures. Filters: ?provider=spotify&status=429&unresolved=true.',
          'diagnostics',
          ['Provider', 'Connection', 'Endpoint', 'Status', 'Reason', 'Occurrences'],
          rows,
          'No recent provider API errors.',
          diagnosticsSummary +
            (activeRateLimits.length
              ? `<section class="section"><div class="section-title">Active rate limits</div><table class="table"><thead><tr><th>Provider</th><th>Connection</th><th>Scope</th><th>Blocked until</th><th>Reason</th></tr></thead><tbody>${activeRateLimits
                  .map(
                    (entry: any) =>
                      `<tr><td>${escapeHtml(entry.provider)}</td><td>${escapeHtml(entry.connectionId)}</td><td>${escapeHtml(entry.scope)}</td><td>${escapeHtml(new Date(entry.blockedUntil).toISOString())}</td><td>${escapeHtml(entry.reason ?? '—')}</td></tr>`,
                  )
                  .join('')}</tbody></table></section>`
              : ''),
        ),
      );
  });
  router.get('/tools', (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    const tools = [...new Set([...REQUIRED_TOOL_NAMES, ...SMART_PLAYLIST_TOOL_NAMES])];
    return res
      .type('html')
      .set(adminPageHeaders)
      .send(
        adminListPage(
          'Tools',
          `Enabled MCP surface for toolset ${cfg.JAMRELAY_TOOLSET}.`,
          'tools',
          ['Tool', 'Availability', 'Permission', 'Execution', 'Safety'],
          tools.map((name) => [
            `<code>${escapeHtml(name)}</code>`,
            toolsetIncludes(cfg.JAMRELAY_TOOLSET, name)
              ? '<span class="badge ok">Enabled</span>'
              : '<span class="badge">Disabled</span>',
            escapeHtml(getToolSecurityMetadata(name)?.permission ?? 'metadata missing'),
            escapeHtml(getToolSecurityMetadata(name)?.executionClass ?? 'metadata missing'),
            getToolSecurityMetadata(name)?.destructive
              ? '<span class="badge danger">Destructive</span>'
              : 'Read-only',
          ]),
          'No tools registered.',
        ),
      );
  });
  router.get('/backups', async (req, res) => {
    if (!owner(req)) return res.redirect('/admin/login');
    const existingBackups = backupOptions
      ? await listApplicationBackups(backupOptions.baseOutputDir)
      : [];
    const backupRows = existingBackups.map((backup) => [
      escapeHtml(backup.name),
      escapeHtml(backup.createdAt),
      escapeHtml(`${backup.bytes} bytes`),
      backup.valid
        ? '<span class="badge ok">Valid</span>'
        : '<span class="badge danger">Invalid</span>',
    ]);
    if (!backupRows.length) backupRows.push(['No backups', '—', '—', '—']);
    return res
      .type('html')
      .set(adminPageHeaders)
      .send(
        withAdminFlash(
          adminListPage(
            'Backups',
            'Application-aware backups exclude encryption keys and run as an owner-authenticated action.',
            'backups',
            ['Backup', 'Created', 'Size', 'Validation'],
            backupRows,
            'No backup workflow is available.',
            backupOptions
              ? `<section class="section"><div class="actions"><form method="post" action="/admin/backups/create"><input type="hidden" name="csrf_token" value="${escapeHtml(owner(req)!.csrf)}"><button class="primary" type="submit">Create backup</button></form></div><p class="muted">Encryption key is excluded; store it separately.</p></section>`
              : '<p class="muted">Create backups with the operator CLI.</p>',
          ),
          owner(req)!.token && ownerSessions.consumeFlash(owner(req)!.token),
        ),
      );
  });
  router.post('/backups/create', express.urlencoded({ extended: false }), async (req, res) => {
    const session = owner(req);
    if (!session || req.body?.csrf_token !== session.csrf)
      return res
        .status(403)
        .type('html')
        .set(adminPageHeaders)
        .send(authResultPage('', false, 'Your owner session or CSRF token is no longer valid.'));
    if (!backupOptions) return res.status(503).redirect('/admin/backups');
    try {
      const outputDir = `${backupOptions.baseOutputDir}/${new Date().toISOString().replace(/[.:]/g, '-')}`;
      const result = await createApplicationBackup({ ...backupOptions, outputDir });
      ownerSessions.setFlash(session.token, `Backup created: ${result.files.length} files.`);
    } catch {
      ownerSessions.setFlash(session.token, 'Backup creation failed. Check the operator logs.');
    }
    return res.redirect('/admin/backups');
  });
}
