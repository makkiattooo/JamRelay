# Public release audit

Date: 2026-09-14

## Release status

JamRelay v1.2.0 passes the automated release gate in the current checkout.
Production readiness still requires the manual provider, deployment, and MCP
client checks listed in `docs/deployment/release-candidate.md`.

## Verified technical scope

- Spotify, SoundCloud, Apple Music, and YouTube adapter unit coverage;
- provider-neutral routing, capability checks, canonical mappings and transfers;
- encrypted provider credential persistence;
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

The automated suite does not prove live provider credentials, upstream quota
behavior, playback devices, or compatibility with a particular hosted MCP
client. Those remain `MANUAL VERIFICATION REQUIRED`.

## Client verification language

No third-party MCP client is marked as manually verified against this exact
release candidate. The repository contains protocol integration tests; live
ChatGPT, Claude, Gemini CLI, Cursor, VS Code/Copilot and Windsurf verification
remain manual checks.

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

If both commands succeed on a clean release checkout and the manual checklist
is complete, the release owner may mark the candidate production-ready.
