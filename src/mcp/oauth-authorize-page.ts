type AuthorizePageData = {
  clientName: string;
  fields: Record<string, string>;
};

type ErrorPageData = {
  title: string;
  message: string;
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );

const pageStart = (title: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${escapeHtml(title)} · JamRelay</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0d1117; color: #e6edf3; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: #0d1117; }
    .card { width: min(100%, 440px); padding: 32px; border: 1px solid #30363d; border-radius: 10px; background: #161b22; }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 30px; color: #e6edf3; font-weight: 600; letter-spacing: -.01em; }
    .brand img { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; }
    h1 { margin: 0 0 12px; color: #f0f3f6; font-size: 29px; line-height: 1.2; letter-spacing: -.025em; }
    .intro { margin: 0 0 24px; color: #8b949e; font-size: 15px; line-height: 1.5; }
    .client { color: #c9d1d9; font-weight: 600; }
    .permissions { margin: 0 0 24px; padding: 0 0 20px; border-bottom: 1px solid #30363d; }
    .permissions-title { margin: 0 0 12px; color: #8b949e; font-size: 13px; font-weight: 600; }
    .permissions ul { margin: 0; padding: 0; list-style: none; }
    .permissions li { display: flex; gap: 9px; align-items: flex-start; margin-top: 9px; color: #c9d1d9; font-size: 14px; line-height: 1.4; }
    .permissions li:first-child { margin-top: 0; }
    .check { flex: 0 0 auto; color: #8b949e; font-size: 14px; line-height: 1.4; }
    label { display: block; margin-bottom: 8px; color: #c9d1d9; font-size: 14px; font-weight: 600; }
    input[type="password"] { width: 100%; padding: 10px 12px; border: 1px solid #484f58; border-radius: 6px; outline: none; background: #0d1117; color: #e6edf3; font: inherit; }
    input[type="password"]:focus { border-color: #8b949e; outline: 2px solid #8b949e; outline-offset: 1px; }
    .actions { display: grid; gap: 8px; margin-top: 20px; }
    button { width: 100%; border: 1px solid transparent; border-radius: 6px; padding: 10px 16px; cursor: pointer; font: inherit; font-size: 14px; font-weight: 600; }
    .primary { background: #238636; color: #ffffff; }
    .primary:hover { background: #2ea043; }
    .cancel { background: transparent; color: #8b949e; }
    .cancel:hover { color: #c9d1d9; }
    .error { display: flex; gap: 10px; align-items: flex-start; margin: 0 0 24px; padding: 2px 0 2px 12px; border-left: 2px solid #da3633; color: #c9d1d9; font-size: 14px; line-height: 1.5; }
    .error-icon { flex: 0 0 auto; color: #f85149; font-weight: 700; }
    footer { margin-top: 28px; color: #6e7681; font-size: 12px; text-align: center; }
    @media (max-width: 520px) { .card { padding: 28px 22px; } body { padding: 14px; } }
  </style>
</head>
<body>
`;

const pageEnd = `</body>
</html>`;

const logo =
  '<img src="/assets/icons/jamrelay-icon-dark.png.png" alt="JamRelay" width="32" height="32">';

const brandName = 'JamRelay Connect';

export const renderAuthorizePage = ({ clientName, fields }: AuthorizePageData) => {
  const hiddenFields = Object.entries(fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join('');

  return `${pageStart('Connect ChatGPT to JamRelay')}
  <main class="card">
    <div class="brand">${logo}<span>${brandName}</span></div>
    <h1>Connect ChatGPT to JamRelay</h1>
    <p class="intro"><span class="client">${escapeHtml(clientName)}</span> is requesting access to your JamRelay account.</p>
    <section class="permissions" aria-labelledby="permissions-title">
      <p class="permissions-title" id="permissions-title">This connection can</p>
      <ul>
        <li><span class="check" aria-hidden="true">✓</span><span>Access JamRelay MCP tools</span></li>
        <li><span class="check" aria-hidden="true">✓</span><span>Maintain a secure connection for this client</span></li>
      </ul>
    </section>
    <form method="post" action="/oauth/authorize">
      ${hiddenFields}
      <label for="owner-secret">Owner secret</label>
      <input id="owner-secret" name="owner_secret" type="password" required autocomplete="current-password">
      <div class="actions">
        <button class="primary" type="submit">Authorize access</button>
        <button class="cancel" type="submit" name="decision" value="cancel" formnovalidate>Cancel</button>
      </div>
    </form>
    <footer>JamRelay • Secure OAuth connection</footer>
  </main>
${pageEnd}`;
};

export const renderOAuthErrorPage = ({ title, message }: ErrorPageData) => `${pageStart(title)}
  <main class="card">
    <div class="brand">${logo}<span>${brandName}</span></div>
    <h1>${escapeHtml(title)}</h1>
    <p class="error" role="alert"><span class="error-icon" aria-hidden="true">!</span><span>${escapeHtml(message)}</span></p>
    <footer>JamRelay • Secure OAuth connection</footer>
  </main>
${pageEnd}`;

export const oauthPageHeaders = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
};
