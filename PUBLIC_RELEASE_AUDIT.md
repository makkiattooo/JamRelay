# Public release audit

Date: 2026-09-12

## Release status

The v1.0.0 technical release gate is **ready** once this final patch passes `npm run check` on the release machine. The previous multi-client OAuth patch already passed 57/57 tests, lint, typecheck, TypeScript build and VitePress build on Windows.

## Verified technical scope

- Spotify OAuth with encrypted token persistence;
- MCP Streamable HTTP transport;
- static Bearer authentication;
- MCP OAuth Authorization Code + PKCE S256;
- RFC 9207 `iss` authorization responses;
- RFC 9728 protected-resource metadata;
- pre-registered confidential/public OAuth clients;
- static multi-client registry;
- RFC 7591 Dynamic Client Registration for deployed-client compatibility;
- owner approval before authorization-code issuance;
- rotating refresh tokens and expiring access tokens;
- Docker/Compose deployment;
- generated MCP tool and environment references;
- multilingual VitePress documentation and translation freshness checks.

## Client verification language

ChatGPT has been exercised end-to-end against the project deployment. MCP Inspector has been used for protocol/debug verification. Claude, Gemini CLI, Cursor, VS Code/Copilot and Windsurf are documented against current vendor behavior, but should remain labelled protocol-compatible/not-yet-manually-verified until each current client build is exercised against this exact release.

## Documentation maintenance model

- English is canonical.
- Polish is high priority.
- German, French and Spanish are best effort.
- Fast-changing tool/environment references are generated.
- Sidebar/navigation structure is declared once.
- Selected translated pages record the hash of the English source they were reviewed against; `npm run docs:check` warns when English changes later.
- A non-English page may legally lag behind English; the site says so explicitly.

## Secrets and generated data

Do not commit `.env`, Spotify/MCP token stores, Cloudflare credentials, production callback secrets, or runtime `/data` contents. Public example files contain placeholders only.

## Public-name note

The repository currently uses the public name **JamRelay**. This audit does not perform trademark clearance or guarantee name uniqueness. That is a release-owner branding decision rather than a code-quality gate.

## Final release command

```bash
npm ci
npm run check
```

If both commands succeed on the clean release checkout/working tree, the technical v1.0.0 gate is satisfied.
