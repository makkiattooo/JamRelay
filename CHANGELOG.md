# Changelog

All notable changes will be documented here following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-09-12

### Added

- Full OAuth/client documentation synchronized across all shipped locales for the v1.0.0 release.
- Translation freshness metadata and stale-translation warnings in `npm run docs:check`.

- Spotify OAuth integration with encrypted token persistence.
- MCP Streamable HTTP with bearer authentication and MCP OAuth/PKCE.
- Spotify search, library, playlist, discovery, and playback tools.
- Docker deployment and multilingual documentation.
- Free-hosting and low-cost deployment guidance.
- Documentation maintenance scripts and checks.
- Configuration tests for optional/partial MCP OAuth behavior.
- Static multi-client MCP OAuth registry support.
- RFC 7591 Dynamic Client Registration for deployed MCP client compatibility.
- Public OAuth clients (`token_endpoint_auth_method=none`) alongside confidential clients.
- RFC 9728 path-suffixed protected-resource discovery for `/mcp`.

### Changed

- Documentation navigation is now defined once for every locale.
- Non-English documentation displays a best-effort translation warning.
- MCP tool and environment references can be regenerated from project sources.
- Local Node.js token storage no longer assumes a system-level `/data` directory.
- MCP OAuth configuration can be fully disabled; partial legacy-client configuration is rejected.
- Static `MCP_API_KEY` authentication now respects `MCP_AUTH_MODE`.
- Expired MCP OAuth records are pruned and unreadable OAuth stores no longer silently reset.
- MCP OAuth authorization redirects now include the authorization-server issuer and advertise RFC 9207 issuer responses.
- Native DCR clients can register loopback and private-use callback URIs with strict scheme checks.
- Existing single-client ChatGPT OAuth environment variables remain backwards compatible.
