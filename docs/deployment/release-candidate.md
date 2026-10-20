# Owner release gate

JamRelay 1.5.8 is prepared on `codex/jamrelay-work`. Nothing in this checklist authorizes publication. Do not merge, tag, publish, deploy or send email until the owner explicitly approves those actions.

## Spotify and Claude Code acceptance

Use the newly built source/image with your existing private `/data` and configuration preserved. For the Windows Compose installation, keep `JAMRELAY_PORT=15268` in the host environment (or your chosen published port).

1. Stop the service and set/migrate the owner password: `docker compose stop jamrelay`, then `docker compose run --rm jamrelay owner password`.
2. Configure your own Spotify application: `docker compose run --rm jamrelay connect provider spotify`. Register the exact printed callback in Spotify. Existing credentials can be retained; they are distinct from account authorization.
3. Run `docker compose up -d --build --wait`. Verify `http://127.0.0.1:15268/health` reports version 1.5.8 and current schema. Run `docker compose run --rm jamrelay onboard`; health/MCP protection should pass, DNS/TLS should show N/A for local HTTP, and it must not request shutdown for read-only steps.
4. Sign in at `http://127.0.0.1:15268/owner/login`, open `/auth/providers/spotify/start`, approve and complete Spotify OAuth. Run `docker compose run --rm jamrelay connections list` to inspect saved records; that alone is not a live API test.
5. On Windows HOST PowerShell run `claude mcp add --transport http jamrelay http://127.0.0.1:15268/mcp` (inspect an existing registration with `claude mcp get jamrelay` first). In Claude Code run `/mcp`, complete browser OAuth, choose the Spotify connection and keep read-only permissions initially.
6. Request tool discovery, `get_connections`, account identity, `get_my_playlists`, `get_playlist_tracks`, and current playback with an active eligible Spotify device. Re-run `jamrelay connect client claude-code --verify` through Compose to check actual server-observed discovery.
7. Reauthorize with playlist writes and destructive permission only for a disposable test playlist. Explicitly create that playlist, add one chosen test track, inspect it, remove the test track and inspect again. Do not test on an important playlist.

Record the actual outcomes. Never infer live Spotify success from fixture tests.

## After explicit release approval

Use the approved commit and review green CI including `docker-smoke`. Merge into `main` only when approved. Pull the resulting release commit, then run:

```bash
npm ci
npm run release:check
npm audit --omit=dev
npm pack --dry-run
npm pack
npm login
npm publish jamrelay-1.5.8.tgz --access public
npm view jamrelay@1.5.8 version repository.url dist.integrity
```

Install in a clean directory and confirm `jamrelay --version` before announcing availability. npm account ownership, name availability and required 2FA/provenance settings must be confirmed by the owner; `npm pack` proves none of those.

Creating this tag triggers the existing GHCR publication workflow. Only after tag/publication approval:

```bash
git tag -a v1.5.8 -m 'JamRelay v1.5.8'
git push origin v1.5.8
```

Wait for `Container release` to publish `ghcr.io/makkiattooo/jamrelay:1.5.8` for `linux/amd64` and `linux/arm64`. Verify the manifest and run the released image with an isolated persistent volume. The workflow also supports an explicit manual publish input. Default manual dispatch builds without pushing.

Create the GitHub Release only after approval, titled `JamRelay v1.5.8`, using notes describing the current authorization, provider and backup fixes, together with the owner password and client integration changes since 1.2.0. Do not announce general availability until actual packages and their public installation paths have been verified.

Docker Hub namespace/account is not established here. No Docker Hub login or push is configured or attempted. Once the owner supplies and authorizes the actual namespace, mirror the approved multi-architecture release with their credentials; do not guess an account or buy a builder.

## Agensi

The free package source is `marketplace/jamrelay`, with `SKILL.md`, installation instructions and an MCP config template. Its ZIP can be built with Python's standard library; include paths relative to that directory and no runtime data. It matches the configuration/instructions model described by Joeri; marketplace acceptance itself is not verified.

The English “ready for a free listing” reply is deliberately pending. Prepare it only after the exact npm version, GHCR image, GitHub Release links and final ZIP have been publicly confirmed. Reply in the existing Agensi thread from the project owner's account, attach the ZIP, identify the project as free/open source and self-hosted, and disclose the unverified provider limitations. Do not send automatically.
