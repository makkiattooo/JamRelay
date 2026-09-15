import type { ProviderConnectionSummary } from '../providers/types.js';

export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );

const providerLabel = (provider: string) =>
  ({
    spotify: 'Spotify',
    soundcloud: 'SoundCloud',
    youtube: 'YouTube',
    'apple-music': 'Apple Music',
  })[provider] ?? provider;
const state = (value: string) =>
  value === 'connected'
    ? 'Connected'
    : value === 'disconnected'
      ? 'Disconnected'
      : 'Not configured';
const roles = (id: string, preferred: { read?: string; write?: string }) =>
  [preferred.read === id ? 'preferred read' : '', preferred.write === id ? 'preferred write' : '']
    .filter(Boolean)
    .join(' · ') || 'no preferred role';
const adminShell = (title: string, content: string, active = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="referrer" content="no-referrer"><link rel="stylesheet" href="/assets/admin/admin.css"><script src="/assets/admin/admin.js" defer></script><title>${escapeHtml(title)} · JamRelay</title></head><body><div class="admin-shell"><aside class="admin-sidebar"><a class="brand" href="/admin"><img src="/assets/icons/jamrelay-icon-dark.png.png" alt="" width="30" height="30">JamRelay</a><div class="nav-group">Overview</div><nav class="admin-nav" aria-label="Primary"><a ${active === 'dashboard' ? 'aria-current="page"' : ''} href="/admin">Overview</a></nav><div class="nav-group">Access</div><nav class="admin-nav" aria-label="Access"><a ${active === 'connections' ? 'aria-current="page"' : ''} href="/admin/connections">Connections</a><a ${active === 'clients' ? 'aria-current="page"' : ''} href="/admin/clients">MCP Clients</a></nav><div class="nav-group">Operations</div><nav class="admin-nav" aria-label="Operations"><a ${active === 'jobs' ? 'aria-current="page"' : ''} href="/admin/jobs">Jobs</a><a ${active === 'diagnostics' ? 'aria-current="page"' : ''} href="/admin/diagnostics">Diagnostics</a></nav><div class="nav-group">System</div><nav class="admin-nav" aria-label="System"><a ${active === 'status' ? 'aria-current="page"' : ''} href="/admin/status">System status</a><a ${active === 'tools' ? 'aria-current="page"' : ''} href="/admin/tools">Tools</a><a ${active === 'backups' ? 'aria-current="page"' : ''} href="/admin/backups">Backups</a></nav></aside><main class="admin-main"><div class="topbar"><button class="menu-button" type="button" data-nav-toggle aria-label="Toggle navigation">Menu</button><span class="crumb">Administration / ${escapeHtml(title)}</span><form method="post" action="/admin/logout"><button type="submit">Sign out</button></form></div>${content}</main></div></body></html>`;
const authPage = (title: string, content: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="referrer" content="no-referrer"><link rel="stylesheet" href="/assets/admin/admin.css"><title>${escapeHtml(title)} · JamRelay</title></head><body class="auth-body"><main class="auth-shell"><a class="brand" href="/admin/login"><img src="/assets/icons/jamrelay-icon-dark.png.png" alt="" width="30" height="30">JamRelay</a>${content}</main></body></html>`;
export const page = (title: string, body: string, active = '') => adminShell(title, body, active);
export const withAdminFlash = (html: string, notice?: string) =>
  notice
    ? html.replace('<main>', `<main><p class="state ok" role="status">${escapeHtml(notice)}</p>`)
    : html;
export const adminPageHeaders = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
const status = (value: string) =>
  `<span class="state ${value === 'connected' ? 'ok' : value === 'disconnected' ? 'bad' : ''}">${escapeHtml(state(value))}</span>`;
export const adminLoginPage = (error = '') =>
  authPage(
    'Administration',
    `<section><p class="muted">JamRelay Administration</p><h1>Owner sign in</h1><p class="intro">Sign in to manage this JamRelay instance. Owner authentication is separate from MCP and provider authentication.</p>${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}<form method="post" action="/admin/login"><label for="owner-secret">Owner secret</label><input id="owner-secret" name="owner_secret" type="password" autocomplete="current-password" required><button class="primary" type="submit">Sign in</button></form></section>`,
  );
export const adminConfirmationPage = (
  title: string,
  message: string,
  action: string,
  csrfToken: string,
) =>
  page(
    title,
    `<main><div class="page-header"><div><h1>${escapeHtml(title)}</h1><p class="intro">${escapeHtml(message)}</p></div></div><form method="post" action="${escapeHtml(action)}"><input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}"><input type="hidden" name="confirmed" value="yes"><div class="actions"><button class="danger" type="submit">Confirm</button><a class="button" href="/admin">Cancel</a></div></form></main>`,
  );
export const dashboardPage = (stats: {
  connections: number;
  connected: number;
  clients: number;
  schema: string;
  activeJobs?: number;
  failedJobs?: number;
  recentErrors?: number;
  activeRateLimits?: number;
  version?: string;
  toolset?: string;
  providerOverview?: ProviderConnectionSummary[];
  preferred?: { read?: string; write?: string };
  recentJobs?: Array<{ id: number; type: string; status: string; updatedAt?: number }>;
  recentFailures?: Array<{
    provider: string;
    connectionId?: string;
    statusCode?: number;
    reason?: string;
    occurrences?: number;
  }>;
  warnings?: string[];
}) => {
  const warningMarkup = stats.warnings?.length
    ? `<section class="section"><div class="section-title">Operational warnings</div><ul>${stats.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></section>`
    : '';
  const rendered = page(
    'JamRelay',
    `<main><div class="page-header"><div><h1>JamRelay overview</h1><p class="intro">Operational status for providers, access, durable work and the State DB.</p><p class="muted">Version ${escapeHtml(stats.version ?? 'unknown')} · Toolset ${escapeHtml(stats.toolset ?? 'unknown')}</p></div><span class="badge ${stats.schema === 'current' ? 'ok' : 'warn'}">${stats.schema === 'current' ? 'Healthy' : 'Attention required'}</span></div><section class="grid"><div class="card"><div class="stat-label">Provider connections</div><div class="stat-value">${stats.connected} / ${stats.connections}</div></div><div class="card"><div class="stat-label">Authorized MCP clients</div><div class="stat-value">${stats.clients}</div></div><div class="card"><div class="stat-label">Active / waiting jobs</div><div class="stat-value">${stats.activeJobs ?? 0}</div></div><div class="card"><div class="stat-label">Failed jobs</div><div class="stat-value">${stats.failedJobs ?? 0}</div></div><div class="card"><div class="stat-label">Active rate limits</div><div class="stat-value">${stats.activeRateLimits ?? 0}</div></div><div class="card"><div class="stat-label">Unresolved API errors</div><div class="stat-value">${stats.recentErrors ?? 0}</div></div><div class="card"><div class="stat-label">Database schema</div><div class="stat-value">${escapeHtml(stats.schema)}</div></div></section><section class="section"><div class="section-title">Provider overview</div>${
      stats.providerOverview?.length
        ? stats.providerOverview
            .map(
              (connection) =>
                `<div class="row"><div><strong>${escapeHtml(connection.displayName || providerLabel(connection.provider))}</strong><div class="muted">${escapeHtml(providerLabel(connection.provider))} · <code>${escapeHtml(connection.connectionId)}</code> · ${escapeHtml(roles(connection.connectionId, stats.preferred ?? {}))} · ${escapeHtml(
                  Object.entries(connection.capabilities ?? {})
                    .filter(([, value]) => value)
                    .map(([key]) => key)
                    .join(', ') || 'no capabilities',
                )}</div></div><div>${status(connection.connected === false ? 'disconnected' : 'connected')} <a href="/admin/connections/${encodeURIComponent(connection.connectionId)}">Details</a></div></div>`,
            )
            .join('')
        : '<div class="empty">No provider connections are configured.</div>'
    }</section><section class="section"><div class="section-title">Active operations</div>${stats.recentJobs?.length ? `<table class="table"><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Updated</th></tr></thead><tbody>${stats.recentJobs.map((job) => `<tr><td><a href="/admin/jobs/${encodeURIComponent(job.id)}">#${escapeHtml(job.id)}</a></td><td>${escapeHtml(job.type)}</td><td>${escapeHtml(job.status)}</td><td>${job.updatedAt ? escapeHtml(new Date(job.updatedAt).toISOString()) : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No running, waiting or recently failed jobs.</div>'}<div class="actions"><a class="button" href="/admin/jobs">View all jobs</a></div></section><section class="section"><div class="section-title">Recent provider failures</div>${stats.recentFailures?.length ? `<table class="table"><thead><tr><th>Provider</th><th>Connection</th><th>Status</th><th>Reason</th><th>Occurrences</th></tr></thead><tbody>${stats.recentFailures.map((error) => `<tr><td>${escapeHtml(error.provider)}</td><td>${escapeHtml(error.connectionId ?? '—')}</td><td>${escapeHtml(error.statusCode ?? '—')}</td><td>${escapeHtml(error.reason ?? '—')}</td><td>${escapeHtml(error.occurrences ?? 1)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No recent provider failures.</div>'}</section><div class="actions"><a class="button primary" href="/admin/providers">Add provider</a><a class="button" href="/admin/jobs">View jobs</a><a class="button" href="/admin/diagnostics">Diagnostics</a><a class="button" href="/admin/clients">Manage clients</a></div></main>`,
    'dashboard',
  );
  return rendered.replace('<section class="grid">', `${warningMarkup}<section class="grid">`);
};
export const connectionsPage = (
  connections: Array<ProviderConnectionSummary & { status?: string }>,
  preferred: { read?: string; write?: string },
  filters: { provider?: string; status?: string; role?: string } = {},
) =>
  page(
    'Connections',
    `<main><div class="page-header"><div><p class="muted">Connection Hub</p><h1>Provider connections</h1><p class="intro">Each connection has independent authorization and capabilities. Disconnecting it retains local state.</p></div><a class="button primary" href="/admin/providers">Add provider</a></div><form method="get" action="/admin/connections" class="filter-form"><label>Provider<select name="provider"><option value="">All providers</option>${['spotify', 'soundcloud', 'youtube', 'apple-music'].map((provider) => `<option value="${provider}"${filters.provider === provider ? ' selected' : ''}>${escapeHtml(providerLabel(provider))}</option>`).join('')}</select></label><label>Status<select name="status"><option value="">All states</option><option value="connected"${filters.status === 'connected' ? ' selected' : ''}>Connected</option><option value="disconnected"${filters.status === 'disconnected' ? ' selected' : ''}>Disconnected</option></select></label><label>Preferred role<select name="role"><option value="">Any role</option><option value="read"${filters.role === 'read' ? ' selected' : ''}>Preferred read</option><option value="write"${filters.role === 'write' ? ' selected' : ''}>Preferred write</option></select></label><button type="submit">Filter</button></form><section class="section">${
      connections.length
        ? `<table class="table"><thead><tr><th>Provider</th><th>Connection</th><th>Status</th><th>Preferred roles</th><th>Capabilities</th><th>Actions</th></tr></thead><tbody>${connections
            .map(
              (c) =>
                `<tr><td>${escapeHtml(providerLabel(c.provider))}</td><td><strong>${escapeHtml(c.displayName || c.provider)}</strong><br><code>${escapeHtml(c.connectionId)}</code></td><td>${status(c.status ?? (c.connected === false ? 'disconnected' : 'connected'))}</td><td>${escapeHtml(roles(c.connectionId, preferred))}</td><td>${escapeHtml(
                  Object.entries(c.capabilities || {})
                    .filter(([, value]) => value)
                    .map(([key]) => key)
                    .join(', ') || 'none',
                )}</td><td><a href="/admin/connections/${encodeURIComponent(c.connectionId)}">Details</a> · <a href="/auth/providers/${encodeURIComponent(c.provider)}/start">Reconnect</a></td></tr>`,
            )
            .join('')}</tbody></table>`
        : '<div class="empty">No provider connections match these filters.</div>'
    }</section></main>`,
    'connections',
  );
export const connectionDetailPage = (
  c: ProviderConnectionSummary,
  preferred: { read?: string; write?: string },
  csrfToken = '',
) =>
  page(
    'Connection details',
    `<main><p><a href="/admin/connections">Connections</a> / Details</p><h1>${escapeHtml(c.displayName || providerLabel(c.provider))}</h1><p class="intro">${escapeHtml(providerLabel(c.provider))} connection details and controls.</p><section class="section"><div class="row"><span>State</span>${status(c.connected === false ? 'disconnected' : 'connected')}</div><div class="row"><span>Connection ID</span><code>${escapeHtml(c.connectionId)}</code></div><div class="row"><span>Provider</span><span>${escapeHtml(providerLabel(c.provider))}</span></div><div class="row"><span>Capabilities</span><span>${escapeHtml(
      Object.entries(c.capabilities || {})
        .filter(([, value]) => value)
        .map(([key]) => key)
        .join(', ') || 'none',
    )}</span></div><div class="row"><span>Preferred role</span><span>${escapeHtml(roles(c.connectionId, preferred))}</span></div></section><div class="actions"><a class="button primary" href="/auth/providers/${encodeURIComponent(c.provider)}/start">Reconnect</a><form method="post" action="/admin/connections/${encodeURIComponent(c.connectionId)}/disconnect"><input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}"><button class="danger" type="submit">Disconnect</button></form></div></main>`,
    'connections',
  );
export const providerChooserPage = (
  providers: Array<{ id: string; label: string; configured: boolean }>,
  csrfToken = '',
  notice = '',
) =>
  page(
    'Add provider',
    `<main><p><a href="/admin/connections">Connections</a> / Add</p><h1>Add a provider</h1><p class="intro">Choose a configured provider. Each service has its own authentication and capability model.</p>${notice ? `<p class="state ok" role="status">${escapeHtml(notice)}</p>` : ''}<section class="section">${providers.map((p) => `<div class="row"><div><h2>${escapeHtml(p.label)}</h2><div class="muted">${p.configured ? 'Server credentials are configured.' : 'Server credentials are not configured.'}</div></div>${p.id === 'apple-music' && p.configured ? `<div><div class="muted">Music User Token onboarding</div><form method="post" action="/admin/providers/apple-music/user-token"><input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}"><label for="apple-music-user-token">Music User Token</label><input id="apple-music-user-token" name="music_user_token" type="password" autocomplete="off" required><button class="primary" type="submit">Save token</button></form></div>` : p.id === 'apple-music' ? '<span class="state">Not configured</span>' : p.configured ? `<a class="button primary" href="/auth/providers/${encodeURIComponent(p.id)}/start">Connect</a>` : '<span class="state">Not configured</span>'}</div>`).join('')}</section></main>`,
    'connections',
  );
export const clientsPage = (
  grants: Array<{ clientId: string; connectionIds: string[]; permissions: string[] }>,
) =>
  page(
    'Authorized clients',
    `<main><h1>Authorized MCP clients</h1><p class="intro">MCP grants are separate from owner authentication and provider connections.</p><section class="section">${grants.length ? grants.map((g) => `<div class="row"><div><h2>${escapeHtml(g.clientId)}</h2><div class="muted">Connections: ${escapeHtml(g.connectionIds.join(', ') || 'none')}</div><div class="muted">Permissions: ${escapeHtml(g.permissions.join(', ') || 'none')}</div></div><a class="button" href="/admin/clients/${encodeURIComponent(g.clientId)}">Manage grant</a></div>`).join('') : '<div class="empty">No MCP clients have been authorized.</div>'}</section></main>`,
    'clients',
  );
export const clientDetailPage = (
  grant: { clientId: string; connectionIds: string[]; permissions: string[] },
  connections: ProviderConnectionSummary[],
  csrfToken: string,
) => {
  const permissions = [
    'catalog.read',
    'library.read',
    'library.write',
    'playlist.read',
    'playlist.write',
    'playlist.destructive',
    'playback.read',
    'playback.control',
    'transfer.plan',
    'transfer.execute',
    'diagnostics.read',
    'personalization.read',
  ];
  return page(
    'Client access',
    `<main><div class="page-header"><div><h1>${escapeHtml(grant.clientId)}</h1><p class="intro">Manage this MCP client's connection and permission grant.</p></div></div><section class="section"><div class="section-title">Provider connections</div><form method="post" action="/admin/clients/${encodeURIComponent(grant.clientId)}"><input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}">${connections.map((connection) => `<label class="row"><span>${escapeHtml(providerLabel(connection.provider))} · <code>${escapeHtml(connection.connectionId)}</code></span><input type="checkbox" name="connection_ids" value="${escapeHtml(connection.connectionId)}"${grant.connectionIds.includes(connection.connectionId) ? ' checked' : ''}></label>`).join('')}<div class="section-title">Permissions</div>${permissions.map((permission) => `<label class="row"><span>${escapeHtml(permission)}${permission.includes('destructive') ? ' (destructive)' : ''}</span><input type="checkbox" name="permissions" value="${escapeHtml(permission)}"${grant.permissions.includes(permission) ? ' checked' : ''}></label>`).join('')}<div class="actions"><button class="primary" type="submit">Save access</button></div></form></section><section class="section"><div class="section-title">Danger zone</div><form method="post" action="/admin/clients/${encodeURIComponent(grant.clientId)}/revoke" data-confirm="Revoke this MCP client's access?"><input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}"><button class="danger" type="submit">Revoke access</button></form></section></main>`,
    'clients',
  );
};
export const systemStatusPage = (data: {
  version: string;
  schema: string;
  currentVersion?: string;
  expectedVersion?: string;
  authMode: string;
  ownerAuth?: string;
  oauth?: string;
  dcr?: string;
  providers: string;
  publicBaseUrl?: string;
  runtime?: string[];
}) =>
  page(
    'System status',
    `<main><h1>System status</h1><p class="intro">Operator diagnostics. Provider connectivity is shown as data and does not determine server health.</p><section class="section"><div class="row"><span>Application version</span><span>${escapeHtml(data.version)}</span></div><div class="row"><span>Database health</span><span>${escapeHtml(data.schema)}</span></div><div class="row"><span>Current schema</span><span>${escapeHtml(data.currentVersion ?? 'unknown')}</span></div><div class="row"><span>Expected schema</span><span>${escapeHtml(data.expectedVersion ?? 'unknown')}</span></div><div class="row"><span>MCP auth mode</span><span>${escapeHtml(data.authMode)}</span></div><div class="row"><span>Owner authentication</span><span>${escapeHtml(data.ownerAuth ?? 'unknown')}</span></div><div class="row"><span>MCP OAuth</span><span>${escapeHtml(data.oauth ?? 'unknown')}</span></div><div class="row"><span>Dynamic client registration</span><span>${escapeHtml(data.dcr ?? 'unknown')}</span></div><div class="row"><span>Providers</span><span>${escapeHtml(data.providers)}</span></div><div class="row"><span>Public base URL</span><span>${escapeHtml(data.publicBaseUrl ?? 'not configured')}</span></div></section><section class="section"><div class="section-title">Safe runtime configuration</div>${(data.runtime ?? []).map((value) => `<div class="row"><span>${escapeHtml(value.split(':')[0])}</span><code>${escapeHtml(value.slice(value.indexOf(':') + 1).trim())}</code></div>`).join('') || '<div class="empty">No runtime configuration values available.</div>'}</section><p class="muted">Secrets, tokens, private keys and raw provider responses are never displayed.</p></main>`,
    'status',
  );
export const adminListPage = (
  title: string,
  intro: string,
  active: string,
  columns: string[],
  rows: string[][],
  empty: string,
  extra = '',
) =>
  page(
    title,
    `<main><div class="page-header"><div><h1>${escapeHtml(title)}</h1><p class="intro">${escapeHtml(intro)}</p></div></div><section class="section"><div class="section-title">${escapeHtml(title)}</div>${rows.length ? `<table class="table"><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<div class="empty">${escapeHtml(empty)}</div>`}</section>${extra}</main>`,
    active,
  );
export const adminJobDetailPage = (
  job: {
    id: number;
    type: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    runAfter?: number | null;
    createdAt: number;
    updatedAt: number;
    startedAt?: number | null;
    completedAt?: number | null;
    counts: Array<{ status: string; count: number }>;
    provider?: string;
    connectionId?: string;
    phase?: string;
    manualReview?: boolean;
    manualReviewReason?: string;
    lastErrorId?: number | null;
    items?: Array<{ id: number; position: number; status: string; errorId?: number | null }>;
    itemOffset?: number;
  },
  csrfToken = '',
) => {
  const counts = job.counts
    .map(
      (entry) =>
        `<div class="card"><div class="stat-label">${escapeHtml(entry.status)}</div><div class="stat-value">${escapeHtml(entry.count)}</div></div>`,
    )
    .join('');
  const itemRows = (job.items ?? [])
    .map(
      (item) =>
        `<tr><td><code>${escapeHtml(item.position)}</code></td><td><code>${escapeHtml(item.id)}</code></td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.errorId ?? '—')}</td></tr>`,
    )
    .join('');
  const offset = Math.max(0, job.itemOffset ?? 0);
  const itemSection = `<section class="section"><div class="section-title">Items ${offset + 1}–${offset + (job.items?.length ?? 0)}</div>${itemRows ? `<table class="table"><thead><tr><th>Position</th><th>Item ID</th><th>Status</th><th>Error</th></tr></thead><tbody>${itemRows}</tbody></table><div class="actions">${offset > 0 ? `<a class="button" href="/admin/jobs/${encodeURIComponent(job.id)}?offset=${Math.max(0, offset - 25)}">Previous</a>` : ''}${(job.items?.length ?? 0) === 25 ? `<a class="button" href="/admin/jobs/${encodeURIComponent(job.id)}?offset=${offset + 25}">Next</a>` : ''}</div>` : '<div class="empty">No job items in this page.</div>'}</section>`;
  const rendered = page(
    'Job details',
    `<main><div class="page-header"><div><h1>Job #${escapeHtml(job.id)}</h1><p class="intro">${escapeHtml(job.type)} · durable execution state</p></div><span class="badge ${job.status === 'failed' ? 'danger' : job.status === 'completed' ? 'ok' : 'warn'}">${escapeHtml(job.status)}</span></div><section class="grid"><div class="card"><div class="stat-label">Provider</div><div class="stat-value">${escapeHtml(job.provider ?? '—')}</div></div><div class="card"><div class="stat-label">Connection</div><div class="stat-value">${escapeHtml(job.connectionId ?? '—')}</div></div><div class="card"><div class="stat-label">Phase</div><div class="stat-value">${escapeHtml(job.phase ?? '—')}</div></div>${counts || '<div class="empty">No item counts available.</div>'}</section><section class="section"><div class="row"><span>Attempts</span><span>${escapeHtml(job.attempts)} / ${escapeHtml(job.maxAttempts)}</span></div><div class="row"><span>Created</span><span>${escapeHtml(new Date(job.createdAt).toISOString())}</span></div><div class="row"><span>Updated</span><span>${escapeHtml(new Date(job.updatedAt).toISOString())}</span></div><div class="row"><span>Run after</span><span>${job.runAfter ? escapeHtml(new Date(job.runAfter).toISOString()) : '—'}</span></div><div class="row"><span>Manual review</span><span>${job.manualReview ? `Required${job.manualReviewReason ? ` · ${escapeHtml(job.manualReviewReason)}` : ''}` : 'No'}</span></div><div class="row"><span>Last error ID</span><span>${escapeHtml(job.lastErrorId ?? '—')}</span></div></section><div class="actions">${['pending', 'waiting', 'running'].includes(job.status) ? `<form method="post" action="/admin/jobs/${encodeURIComponent(job.id)}/cancel" data-confirm="Cancel this job?"><input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}"><button class="danger" type="submit">Cancel job</button></form>` : ''}${['failed', 'cancelled'].includes(job.status) && !job.manualReview ? `<form method="post" action="/admin/jobs/${encodeURIComponent(job.id)}/resume"><input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}"><button class="primary" type="submit">Resume job</button></form>` : ''}<a class="button" href="/admin/jobs">Back to jobs</a></div></main>`,
    'jobs',
  );
  return rendered.replace('</main>', `${itemSection}</main>`);
};
export const authResultPage = (
  provider: string,
  ok: boolean,
  message: string,
  requestId?: string,
) =>
  authPage(
    ok ? 'Connection successful' : 'Authorization failed',
    `<section><h1>${ok ? 'Connection successful' : 'Authorization failed'}</h1><h2>${escapeHtml(providerLabel(provider))}</h2><p class="intro">${escapeHtml(message)}</p>${requestId ? `<p class="muted">Diagnostic request ID: <code>${escapeHtml(requestId)}</code></p>` : ''}<div class="actions"><a class="button primary" href="/admin/connections">View connections</a><a class="button" href="/admin/providers">Back to providers</a></div></section>`,
  );
export const adminErrorPage = (
  statusCode: number,
  title: string,
  message: string,
  requestId = '',
) =>
  page(
    title,
    `<main><div class="page-header"><div><h1>${escapeHtml(title)}</h1><p class="intro">${escapeHtml(message)}</p>${requestId ? `<p class="muted">Request ID: <code>${escapeHtml(requestId)}</code></p>` : ''}</div><span class="badge danger">${escapeHtml(statusCode)}</span></div><div class="actions"><a class="button primary" href="/admin">Back to overview</a><a class="button" href="/admin/diagnostics">Diagnostics</a></div></main>`,
  );
