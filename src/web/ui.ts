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

const shell = (title: string, content: string, active = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${escapeHtml(title)} · JamRelay</title>
<meta name="referrer" content="no-referrer"><style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#e8eef5;background:#10151c;line-height:1.5}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 0,#1b2a38 0,#10151c 42%)}
a{color:#82c7ff}a:focus,button:focus,input:focus{outline:3px solid #8bd3ff;outline-offset:2px}
.top{border-bottom:1px solid #2c3946;background:#151d26}.bar{max-width:1120px;margin:auto;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:18px}.brand{font-weight:800;color:#fff;text-decoration:none;letter-spacing:.02em}.nav{display:flex;gap:14px;flex-wrap:wrap}.nav a{font-size:.92rem;text-decoration:none;padding:6px 8px;border-radius:6px}.nav a[aria-current=page]{background:#263c50;color:#fff}
main{max-width:1120px;margin:0 auto;padding:44px 24px 70px}.eyebrow{color:#8bd3ff;text-transform:uppercase;letter-spacing:.12em;font-size:.76rem;font-weight:700}h1{font-size:clamp(2rem,5vw,3.4rem);line-height:1.08;margin:8px 0 12px}h2{margin-top:0}.lede{color:#b3c0cd;max-width:720px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin:28px 0}.card{background:#18222c;border:1px solid #314252;border-radius:14px;padding:22px;box-shadow:0 8px 24px #0002}.muted{color:#a9b7c5}.label{font-size:.8rem;color:#9db0c0;text-transform:uppercase;letter-spacing:.08em}.value{font-size:1.55rem;font-weight:750;margin-top:5px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.button,button{display:inline-block;border:1px solid #52708a;border-radius:8px;background:#263d52;color:#fff;padding:10px 15px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.button.primary,button.primary{background:#1676b8;border-color:#58b9ef}.button.danger,button.danger{background:#742d37;border-color:#c46d78}.badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:.78rem;font-weight:750;background:#29465b;color:#bce3ff}.badge.ok{background:#214a3d;color:#a9f0cd}.badge.warn{background:#5a4521;color:#ffe0a1}.badge.bad{background:#5b2932;color:#ffc1c8}.list{display:grid;gap:12px}.row{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}.details{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.details div{border-top:1px solid #314252;padding-top:8px}form{display:grid;gap:12px;max-width:520px}label{font-weight:650}input,select{width:100%;padding:11px 12px;border:1px solid #52708a;border-radius:8px;background:#101820;color:#fff;font:inherit}.alert{padding:13px 15px;border-radius:9px;background:#5b2932;color:#ffd5d9;margin:18px 0}.empty{padding:32px;text-align:center;border:1px dashed #52708a;border-radius:12px;color:#a9b7c5}@media(max-width:600px){.bar{padding:15px}.nav{gap:3px}main{padding:30px 15px}.card{padding:18px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style></head><body><header class="top"><div class="bar"><a class="brand" href="/admin">◆ JamRelay</a><nav class="nav" aria-label="Administration"><a ${active === 'connections' ? 'aria-current="page"' : ''} href="/admin/connections">Connections</a><a ${active === 'clients' ? 'aria-current="page"' : ''} href="/admin/clients">Clients</a><a ${active === 'status' ? 'aria-current="page"' : ''} href="/admin/status">System status</a></nav></div></header>${content}</body></html>`;

export const page = (title: string, body: string, active = '') =>
  shell(title, `<main>${body}</main>`, active);
const statusBadge = (status: string) =>
  `<span class="badge ${status === 'connected' ? 'ok' : status === 'error' ? 'bad' : 'warn'}">${escapeHtml(status)}</span>`;
const preferredRoles = (id: string, preferred: { read?: string; write?: string }) => {
  const roles = [
    preferred.read === id ? '<span class="badge">Read</span>' : '',
    preferred.write === id ? '<span class="badge">Write</span>' : '',
  ].filter(Boolean);
  return roles.join(' ') || 'None';
};

export const adminLoginPage = (error = '') =>
  page(
    'Administration',
    `<div class="card" style="max-width:520px;margin:8vh auto"><div class="eyebrow">JamRelay Administration</div><h1>Owner sign in</h1><p class="lede">Sign in to manage this JamRelay instance. This is owner authentication, not Spotify, SoundCloud, YouTube, or Apple Music authentication.</p>${error ? `<div class="alert" role="alert">${escapeHtml(error)}</div>` : ''}<form method="post" action="/admin/login"><label for="owner-secret">Owner secret</label><input id="owner-secret" name="owner_secret" type="password" autocomplete="current-password" required><button class="primary" type="submit">Sign in securely</button></form></div>`,
  );

export const dashboardPage = (stats: {
  connections: number;
  connected: number;
  clients: number;
  schema: string;
}) =>
  page(
    'Dashboard',
    `<div class="eyebrow">Owner dashboard</div><h1>JamRelay</h1><p class="lede">Manage provider connections and MCP client access from one administration space.</p><section class="grid" aria-label="Instance summary"><div class="card"><div class="label">Instance status</div><div class="value"><span class="badge ok">Operational</span></div></div><div class="card"><div class="label">Connected providers</div><div class="value">${stats.connected}</div><div class="muted">of ${stats.connections} connections</div></div><div class="card"><div class="label">Authorized MCP clients</div><div class="value">${stats.clients}</div></div><div class="card"><div class="label">Database schema</div><div class="value">${escapeHtml(stats.schema)}</div></div></section><div class="grid"><section class="card"><h2>Connections</h2><p class="muted">Music provider authorization, health and preferred read/write roles.</p><a class="button primary" href="/admin/connections">Open Connection Hub</a></section><section class="card"><h2>Authorized clients</h2><p class="muted">Review MCP OAuth grants and revoke access when needed.</p><a class="button" href="/admin/clients">Manage clients</a></section><section class="card"><h2>MCP endpoint</h2><p class="muted"><code>/mcp</code><br>Owner authentication and MCP OAuth are separate security layers.</p></section></div><form method="post" action="/owner/logout"><button class="button" type="submit">Sign out</button></form>`,
  );

export const connectionsPage = (
  connections: ProviderConnectionSummary[],
  preferred: { read?: string; write?: string },
) =>
  page(
    'Connections',
    `<div class="eyebrow">Connection Hub</div><h1>Music provider connections</h1><p class="lede">Each connection has its own authorization, account identity and capabilities. Disconnecting removes authorization but retains JamRelay history and snapshots.</p><div class="actions"><a class="button primary" href="/admin/providers">＋ Connect a music service</a><a class="button" href="/admin">Dashboard</a></div><section class="list" style="margin-top:28px">${
      connections.length
        ? connections
            .map(
              (c) =>
                `<article class="card"><div class="row"><div><h2>${escapeHtml(c.displayName || providerLabel(c.provider))}</h2><p class="muted">${escapeHtml(providerLabel(c.provider))} · <code>${escapeHtml(c.connectionId)}</code></p></div>${statusBadge(c.connected === false ? 'disconnected' : 'connected')}</div><div class="details"><div><span class="label">Capabilities</span><br>${escapeHtml(
                  Object.entries(c.capabilities || {})
                    .filter(([, v]) => v)
                    .map(([k]) => k)
                    .join(', ') || 'None',
                )}</div><div><span class="label">Preferred roles</span><br>${preferredRoles(c.connectionId, preferred)}</div></div><div class="actions"><a class="button" href="/admin/connections/${encodeURIComponent(c.connectionId)}">View connection</a><a class="button" href="/auth/providers/${encodeURIComponent(c.provider)}/start">Reconnect</a></div></article>`,
            )
            .join('')
        : '<div class="empty">No provider connections are configured.</div>'
    }</section>`,
    'connections',
  );

export const connectionDetailPage = (
  c: ProviderConnectionSummary,
  preferred: { read?: string; write?: string },
  csrfToken = '',
) =>
  page(
    'Connection details',
    `<div class="eyebrow"><a href="/admin/connections">Connections</a> / Details</div><h1>${escapeHtml(c.displayName || providerLabel(c.provider))}</h1><p class="lede">${escapeHtml(providerLabel(c.provider))} connection details and access controls.</p><section class="card"><div class="row"><h2>Status</h2>${statusBadge(c.connected === false ? 'disconnected' : 'connected')}</div><div class="details"><div><span class="label">Provider</span><br>${escapeHtml(providerLabel(c.provider))}</div><div><span class="label">Connection ID</span><br><code>${escapeHtml(c.connectionId)}</code></div><div><span class="label">Account</span><br>${escapeHtml((c.metadata?.account as any)?.displayName || (c.metadata?.account as any)?.id || 'Not provided')}</div><div><span class="label">Preferred roles</span><br>${preferredRoles(c.connectionId, preferred)}</div></div><div class="actions"><a class="button primary" href="/auth/providers/${encodeURIComponent(c.provider)}/start">Reconnect</a><form method="post" action="/admin/connections/${encodeURIComponent(c.connectionId)}/disconnect"><input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}"><button class="danger" type="submit">Disconnect</button></form></div></section>`,
    'connections',
  );

export const providerChooserPage = (
  providers: Array<{ id: string; label: string; configured: boolean }>,
) =>
  page(
    'Connect provider',
    `<div class="eyebrow"><a href="/admin/connections">Connections</a> / Add</div><h1>Connect a music service</h1><p class="lede">Choose a provider that is configured in this JamRelay instance. Each provider uses its own authorization model.</p><div class="grid">${providers.map((p) => `<article class="card"><h2>${escapeHtml(p.label)}</h2><p class="muted">${p.configured ? 'Ready for provider authorization.' : 'Not configured on this server.'}</p>${p.configured ? `<a class="button primary" href="/auth/providers/${encodeURIComponent(p.id)}/start">Connect ${escapeHtml(p.label)}</a>` : '<span class="badge warn">Disabled</span>'}</article>`).join('')}</div>`,
    'connections',
  );

export const authResultPage = (
  provider: string,
  ok: boolean,
  message: string,
  requestId?: string,
) =>
  page(
    ok ? 'Connection successful' : 'Connection could not be completed',
    `<div class="card" style="max-width:650px;margin:8vh auto"><div class="eyebrow">JamRelay connection</div><h1>${ok ? 'Connection successful' : 'Authorization failed'}</h1><h2>${escapeHtml(providerLabel(provider))}</h2><p class="lede">${escapeHtml(message)}</p>${requestId ? `<p class="muted">Diagnostic request ID: <code>${escapeHtml(requestId)}</code></p>` : ''}<div class="actions"><a class="button primary" href="/admin/connections">View connections</a><a class="button" href="/admin/providers">Back to providers</a></div></div>`,
  );
