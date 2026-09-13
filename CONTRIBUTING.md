# Contributing to TuneLink

Thank you for your interest in contributing to TuneLink.

Contributions are welcome, including bug fixes, documentation improvements, tests, compatibility fixes, security improvements, and new features.

By submitting a contribution, you agree to follow the rules below.

## Development setup

Requirements:

* Node.js 22 or newer
* npm
* Git

Install dependencies:

```bash
npm ci
```

Copy the example environment file:

```bash
cp .env.example .env
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

Never commit real credentials, tokens, secrets, private account identifiers, production URLs, encryption keys, or runtime data.

## Development workflow

1. Create a focused branch.
2. Keep changes limited to one logical purpose whenever practical.
3. Preserve backwards compatibility unless the change intentionally introduces a documented breaking change.
4. Add or update tests for behavior you modify.
5. Update documentation when public behavior, configuration, scopes, endpoints, tools, security assumptions, or compatibility changes.
6. Explain important security and compatibility implications in the pull request.

Before submitting a pull request, run:

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npm run docs:build
```

Prefer running the complete validation suite:

```bash
npm run check
```

## Security-sensitive changes

Changes affecting authentication, authorization, OAuth, token storage, encryption, network exposure, request validation, redirects, dynamic client registration, or persistent storage require particular care.

Do not weaken security controls solely for convenience or compatibility.

Security vulnerabilities should not be disclosed publicly before the maintainer has had a reasonable opportunity to investigate them. Follow the process described in `SECURITY.md`.

## Third-party code

Do not submit code that you do not have the legal right to contribute.

If a contribution includes or is derived from third-party material, you must:

* identify the original source;
* identify the applicable license;
* ensure that the license is compatible with TuneLink;
* preserve any legally required notices or attribution.

Do not copy code from proprietary projects, leaked source code, code with unknown licensing, or material whose terms are incompatible with this project.

## License

TuneLink is licensed under the **GNU Affero General Public License v3.0 only (`AGPL-3.0-only`)** unless a file explicitly states otherwise.

Contributions accepted into the public TuneLink project are distributed under `AGPL-3.0-only`.

Submitting a contribution also requires agreement to the TuneLink Contributor License Agreement in `CLA.md`.

The CLA does **not** transfer ownership of your copyright. It grants the TuneLink Project Owner additional rights necessary to maintain the project, enforce its licensing model, and potentially offer the project under additional licensing terms in the future.

## Contributor declaration

When submitting a pull request, include the following declaration:

> I have the right to submit this contribution, and I agree to the TuneLink Contributor License Agreement in CLA.md.

A contribution may not be accepted until this declaration is present.

## Contribution ownership

You retain copyright in contributions that you create.

Nothing in this contribution process grants contributors ownership of the TuneLink name, logo, domains, infrastructure, official distribution channels, project accounts, or other project assets.

## Review and acceptance

Submission of a contribution does not guarantee acceptance.

The maintainers may request changes or reject contributions for technical, architectural, security, maintenance, licensing, compatibility, or project-direction reasons.

Where multiple implementations are possible, prefer extending the existing architecture and source of truth instead of introducing parallel implementations without a clear reason.
