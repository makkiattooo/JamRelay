# Contributing

1. Install Node.js 22+, run `npm ci`, and copy `.env.example` to `.env`.
2. Create a focused branch and keep public behavior stable.
3. Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run docs:build`.
4. For an MCP tool or Spotify endpoint, add mocked tests, update the tool reference, and document scopes and errors.
5. Explain security, configuration, and compatibility implications in the pull request.

Do not include secrets, live tokens, private account identifiers, or production hostnames in commits or tests. Preserve the existing architecture and prefer the current source of truth over parallel implementations.
