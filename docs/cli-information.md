# CLI updates and notices

Human-facing CLI output supports Polish, English, German, French and Spanish. Interactive `setup`/`config` begins with a language selector whose instructions are shown in all five languages; number keys choose immediately, and arrow keys plus Enter also work. It saves `JAMRELAY_LANGUAGE`. An environment override takes precedence over the selected installation’s saved preference; see [installation](/installation#cli-language). `--json` keeps its existing English keys, messages and machine-readable values. Remote release notes and project notices remain in their original language. `doctor` without `--json` displays localized diagnostics.

Use `jamrelay onboard` to resume provider and MCP client setup. `jamrelay connect provider NAME` guides application setup separately from personal account authorization. `jamrelay connect client NAME` prints the endpoint and client-specific instructions; supported client names are `chatgpt`, `claude`, `cursor`, `vscode` and `generic`. The guide reports server reachability and saved token records separately; it does not claim that a saved token has been verified with the external provider.

The CLI provides local information commands; none starts the server or opens SQLite:

```bash
jamrelay info --json
jamrelay update
jamrelay update check --refresh
jamrelay update check --offline
jamrelay update channel beta       # or stable (default)
jamrelay changelog --latest
jamrelay changelog --version 1.5.0
jamrelay notices --offline
jamrelay notices --all
jamrelay notices read NOTICE_ID
jamrelay notices dismiss NOTICE_ID
jamrelay notifications status
jamrelay notifications enable      # disable reverses this
```

`--json` is available on all information commands. Offline changelog reads also accept `--offline`. Bad arguments return exit code 2; metadata validation/local persistence errors return 1. Offline/unpublished results are useful normal output, not installation failures.

Updates read the installed package's npm distribution tags and verify its official repository identity before suggesting an exact version. Stable excludes prereleases; beta considers latest/beta/next and published Node engine compatibility. Source installations use official GitHub Releases, never development commits. Docker checks public tags in `ghcr.io/makkiattooo/jamrelay` through an anonymous pull-scope registry token; inaccessible images are unverified. Release/tag history is bounded to 100 entries per request. GitHub/GHCR metadata does not declare Node engine requirements; review release notes before upgrading. Commands only show instructions: no installation, restart, migration or data changes are executed.

Preferences live in `cli-state.json` beside the selected private configuration, separately from OAuth/encryption settings. Cache follows XDG cache on Linux, Library/Caches on macOS, LocalAppData on Windows and `/data/cli-cache` in Docker. Optional overrides: `JAMRELAY_CLI_STATE_PATH`, `JAMRELAY_CACHE_DIR`, `JAMRELAY_CLI_CACHE_TTL_MS` (default 86400000; accepted range 1000–2592000000).

Requests have a 2.5-second deadline, fixed HTTPS destinations, no redirects and bounded JSON size/depth. ETags/304 are supported. Cache writes are atomic; failures retain last known good data. Cached/offline results are explicitly labeled and cannot produce a verified-current upgrade command. Damaged caches are ignored. Packaged changelog/notices keep installations useful before public distribution exists.

Passive checks are opt-in during interactive setup or through `notifications enable`. Existing/noninteractive installations default to disabled. Enabled checks occur only on human TTY `info`, `status` and `doctor`, at most once per TTL, with one brief hint. They never appear in JSON, pipelines, server startup, MCP or OAuth. No credentials, installation IDs, telemetry, playlist data or read receipts are sent; read/dismiss state stays local. Dismissed security notices remain visible in explicit `notices` output.

## Maintainer notice feed

Edit `.github/cli/notices.json`, validate it with the repository tests, and merge it into `main`. The fixed public URL is:

```text
https://raw.githubusercontent.com/makkiattooo/JamRelay/main/.github/cli/notices.json
```

No npm/image release is needed to publish another notice. Until that file reaches `main`, clients use the bundled feed; pushing a development branch does not publish the central feed. npm/GHCR availability is independent from GitHub commits/releases.

Schema version 1 is strict: `schemaVersion`, ISO UTC `generatedAt`, and up to 100 notices. Each notice has a unique `id` (1–100 letters/digits/dots/underscores/hyphens, starting with a letter/digit), `severity` (`info`, `warning`, `security`), plain `title` (160 chars), `message` (2000), UTC `publishedAt`, nullable/optional `expiresAt`, one or both `channels` (`stable`, `beta`), nullable/optional SemVer `minVersion` and `maxVersion` (inclusive), and optional nullable HTTPS `url` under the official GitHub repository. Unknown fields, duplicate IDs, markup, terminal controls, bidi controls and invalid version/time ranges are rejected. Do not embed HTML, executable commands or credentials.

Future, expired, incompatible-version and other-channel notices are filtered. `--all` includes applicable expired/dismissed entries with labels. Keep IDs stable when editing a notice: local read/dismiss preferences remain attached to the ID. Use a new ID for a materially new announcement.
