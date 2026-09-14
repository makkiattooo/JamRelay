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
const css = `:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0d1117;color:#e6edf3}*{box-sizing:border-box}body{min-height:100vh;margin:0;padding:24px;background:#0d1117}a{color:#8b949e}a:hover{color:#c9d1d9}.wrap{width:min(100%,760px);margin:auto}.brand{display:flex;align-items:center;gap:10px;margin:12px 0 42px;color:#e6edf3;font-weight:600;text-decoration:none}.brand img{width:32px;height:32px;border-radius:6px}nav{display:flex;flex-wrap:wrap;gap:16px;margin:-24px 0 36px;font-size:14px}h1{margin:0 0 12px;color:#f0f3f6;font-size:29px;line-height:1.2}h2{margin:28px 0 8px;color:#f0f3f6;font-size:18px}p{color:#8b949e;line-height:1.5}code{color:#c9d1d9}.intro{margin:0 0 24px;max-width:680px}.section{margin:26px 0;padding:18px 0;border-top:1px solid #30363d}.row{display:flex;justify-content:space-between;align-items:baseline;gap:18px;padding:14px 0;border-bottom:1px solid #21262d}.row:last-child{border-bottom:0}.muted{color:#8b949e;font-size:14px}.state{color:#d29922;font-size:14px}.state.ok{color:#7ee787}.state.bad{color:#f85149}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}.button,button{display:inline-block;border:1px solid #484f58;border-radius:6px;padding:9px 14px;background:transparent;color:#c9d1d9;font:inherit;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer}.button:hover,button:hover{border-color:#8b949e}.primary{border-color:#238636;background:#238636;color:#fff}.danger{border-color:#da3633;color:#ff7b72}form{display:grid;gap:10px;max-width:440px}label{color:#c9d1d9;font-size:14px;font-weight:600}input{width:100%;padding:10px 12px;border:1px solid #484f58;border-radius:6px;background:#010409;color:#e6edf3;font:inherit}.error{margin:18px 0;padding-left:12px;border-left:2px solid #da3633;color:#ff7b72}.empty{padding:18px 0;color:#8b949e}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:18px}@media(max-width:520px){body{padding:14px}.brand{margin-bottom:34px}.row{display:block}.row .state{display:block;margin-top:6px}}`;
const shell = (title: string, content: string, active = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)} · JamRelay</title><style>${css}</style></head><body><div class="wrap"><a class="brand" href="/admin"><img src="/assets/icons/jamrelay-icon-dark.png.png" alt="JamRelay" width="32" height="32">JamRelay</a><nav aria-label="Administration"><a ${active === 'connections' ? 'aria-current="page"' : ''} href="/admin/connections">Connections</a><a ${active === 'clients' ? 'aria-current="page"' : ''} href="/admin/clients">Clients</a><a ${active === 'status' ? 'aria-current="page"' : ''} href="/admin/status">System status</a></nav>${content}</div></body></html>`;
export const page = (title: string, body: string, active = '') => shell(title, body, active);
const status = (value: string) =>
  `<span class="state ${value === 'connected' ? 'ok' : value === 'disconnected' ? 'bad' : ''}">${escapeHtml(state(value))}</span>`;
export const adminLoginPage = (error = '') =>
  page(
    'Administration',
    `<main><p class="muted">JamRelay Administration</p><h1>Owner sign in</h1><p class="intro">Sign in to manage this JamRelay instance. Owner authentication is separate from MCP and provider authentication.</p>${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}<form method="post" action="/admin/login"><label for="owner-secret">Owner secret</label><input id="owner-secret" name="owner_secret" type="password" autocomplete="current-password" required><button class="primary" type="submit">Sign in</button></form></main>`,
  );
export const dashboardPage = (stats: {
  connections: number;
  connected: number;
  clients: number;
  schema: string;
}) =>
  page(
    'JamRelay',
    `<main><h1>JamRelay</h1><p class="intro">Owner controls for provider connections, MCP grants and system diagnostics.</p><section class="section facts"><div><div class="muted">Connections</div><div>${stats.connected} connected / ${stats.connections} configured</div></div><div><div class="muted">MCP clients</div><div>${stats.clients} authorized</div></div><div><div class="muted">Database</div><div>${escapeHtml(stats.schema)}</div></div></section><div class="actions"><a class="button primary" href="/admin/connections">Connections</a><a class="button" href="/admin/clients">Clients</a><a class="button" href="/admin/status">System status</a><form method="post" action="/owner/logout"><button type="submit">Sign out</button></form></div></main>`,
  );
export const connectionsPage = (
  connections: ProviderConnectionSummary[],
  preferred: { read?: string; write?: string },
) =>
  page(
    'Connections',
    `<main><p class="muted">Connection Hub</p><h1>Provider connections</h1><p class="intro">Each connection has independent authorization and capabilities. Disconnecting it retains local state.</p><div class="actions"><a class="button primary" href="/admin/providers">Add provider</a><a class="button" href="/admin">Home</a></div><section class="section">${
      connections.length
        ? connections
            .map(
              (c) =>
                `<div class="row"><div><h2>${escapeHtml(c.displayName || providerLabel(c.provider))}</h2><div class="muted">${escapeHtml(providerLabel(c.provider))} · <code>${escapeHtml(c.connectionId)}</code></div><div class="muted">Capabilities: ${escapeHtml(
                  Object.entries(c.capabilities || {})
                    .filter(([, value]) => value)
                    .map(([key]) => key)
                    .join(', ') || 'none',
                )} · ${escapeHtml(roles(c.connectionId, preferred))}</div></div><div>${status(c.connected === false ? 'disconnected' : 'connected')}<div class="actions"><a href="/admin/connections/${encodeURIComponent(c.connectionId)}">Details</a> <a href="/auth/providers/${encodeURIComponent(c.provider)}/start">Reconnect</a></div></div></div>`,
            )
            .join('')
        : '<div class="empty">No provider connections are configured. JamRelay can operate with zero providers.</div>'
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
) =>
  page(
    'Add provider',
    `<main><p><a href="/admin/connections">Connections</a> / Add</p><h1>Add a provider</h1><p class="intro">Choose a configured provider. Each service has its own authentication and capability model.</p><section class="section">${providers.map((p) => `<div class="row"><div><h2>${escapeHtml(p.label)}</h2><div class="muted">${p.configured ? 'Server credentials are configured.' : 'Server credentials are not configured.'}</div></div>${p.id === 'apple-music' ? '<span class="state">Music User Token onboarding</span>' : p.configured ? `<a class="button primary" href="/auth/providers/${encodeURIComponent(p.id)}/start">Connect</a>` : '<span class="state">Not configured</span>'}</div>`).join('')}</section></main>`,
    'connections',
  );
export const clientsPage = (
  grants: Array<{ clientId: string; connectionIds: string[]; permissions: string[] }>,
) =>
  page(
    'Authorized clients',
    `<main><h1>Authorized MCP clients</h1><p class="intro">MCP grants are separate from owner authentication and provider connections.</p><section class="section">${grants.length ? grants.map((g) => `<div class="row"><div><h2>${escapeHtml(g.clientId)}</h2><div class="muted">Connections: ${escapeHtml(g.connectionIds.join(', ') || 'none')}</div><div class="muted">Permissions: ${escapeHtml(g.permissions.join(', ') || 'none')}</div></div><a href="/owner/grants">Manage grant</a></div>`).join('') : '<div class="empty">No MCP clients have been authorized.</div>'}</section></main>`,
    'clients',
  );
export const systemStatusPage = (data: {
  version: string;
  schema: string;
  currentVersion?: string;
  authMode: string;
  providers: string;
}) =>
  page(
    'System status',
    `<main><h1>System status</h1><p class="intro">Operator diagnostics. Provider connectivity is shown as data and does not determine server health.</p><section class="section"><div class="row"><span>Application version</span><span>${escapeHtml(data.version)}</span></div><div class="row"><span>Database</span><span>${escapeHtml(data.schema)}${data.currentVersion ? ` · ${escapeHtml(data.currentVersion)}` : ''}</span></div><div class="row"><span>MCP auth mode</span><span>${escapeHtml(data.authMode)}</span></div><div class="row"><span>Providers</span><span>${escapeHtml(data.providers)}</span></div></section><p class="muted">Secrets, tokens, private keys and raw provider responses are never displayed.</p></main>`,
    'status',
  );
export const authResultPage = (
  provider: string,
  ok: boolean,
  message: string,
  requestId?: string,
) =>
  page(
    ok ? 'Connection successful' : 'Authorization failed',
    `<main><h1>${ok ? 'Connection successful' : 'Authorization failed'}</h1><h2>${escapeHtml(providerLabel(provider))}</h2><p class="intro">${escapeHtml(message)}</p>${requestId ? `<p class="muted">Diagnostic request ID: <code>${escapeHtml(requestId)}</code></p>` : ''}<div class="actions"><a class="button primary" href="/admin/connections">View connections</a><a class="button" href="/admin/providers">Back to providers</a></div></main>`,
  );
