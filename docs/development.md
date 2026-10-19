# Development

```text
src/       Express app, MCP routes/tools, Spotify client/auth/storage, utilities
tests/     unit, behavioral, OAuth, integration, and quality tests
docs/      VitePress documentation
```

Run `npm ci`, then `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run docs:build`.

When adding a tool, update registration, tests, and `docs/tools.md`. Preserve public names and behavior. Use mocked Spotify responses in CI; do not require a live account. Pull requests should explain security impact, configuration changes, and documentation updates.

## Versioning and release process

`package.json` is the source of the installed application version. `src/version.ts` reads that metadata; CLI screens and health responses use the same value. npm synchronizes `package-lock.json` during a version bump:

```bash
npm version <new-semver> --no-git-tag-version
```

Add one entry to `CHANGELOG.md`, run `npm run check` and `npm pack --dry-run`, then review and commit. No README, CLI version constant or installation example needs a manual version edit. Compatibility requirements and historical release/migration notes retain their original version numbers.

Publishing is a separate, intentional action. npm dist-tags, GHCR tags and GitHub Releases reflect actual published artifacts, not the local package version or a development commit. The container workflow derives image tags from `package.json` and validates an intentional version tag; ordinary branch pushes do not publish images. Do not tag, publish or deploy as part of routine version bumping.

For older changes see the repository CHANGELOG and GitHub Releases. Historical documentation URLs remain available, but are excluded from the primary navigation.
