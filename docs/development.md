# Development

```text
src/       Express app, MCP routes/tools, Spotify client/auth/storage, utilities
tests/     unit, behavioral, OAuth, integration, and quality tests
docs/      VitePress documentation
```

Run `npm ci`, then `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run docs:build`.

When adding a tool, update registration, tests, and `docs/tools.md`. Preserve public names and behavior. Use mocked Spotify responses in CI; do not require a live account. Pull requests should explain security impact, configuration changes, and documentation updates.
