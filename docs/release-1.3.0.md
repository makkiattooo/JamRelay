# JamRelay 1.3.0

JamRelay 1.3.0 is a production-hardening and operations release.

It builds on the provider-neutral architecture introduced in 1.2.0 and focuses on making JamRelay safer and more predictable under concurrency, easier to operate, faster on large playlist workflows, and substantially more useful to administer through the built-in web console.

## Highlights

- production hardening across credentials, request lifecycle, jobs and provider I/O;
- a substantially expanded Admin Console;
- provider-neutral playlist state acquisition;
- revision-aware playlist caching and request-scoped singleflight;
- bounded concurrency for large operations;
- granular playlist capabilities;
- centralized MCP tool security metadata;
- safer playlist mutation orchestration;
- application-aware backup tooling;
- expanded regression and architecture tests.

## Reliability and concurrency

Encrypted provider credentials now use serialized mutation handling so concurrent saves, updates and removals cannot silently overwrite unrelated records in the same credential store.

JamRelay also introduces shared bounded-concurrency primitives for operations that can safely run in parallel. This avoids both slow fully sequential bulk processing and unsafe unbounded `Promise.all()` fan-out.

Ordered playlist writes remain conservative where provider ordering semantics require serialization.

## Request lifecycle and cancellation

MCP request execution now participates in the actual request lifecycle instead of being detached from it.

JamRelay propagates cancellation and deadlines further into provider work and distinguishes short interactive work from heavier operations. Provider requests use bounded execution rather than being allowed to remain stuck indefinitely.

The durable job runner now tracks active work during shutdown so SQLite is not closed underneath still-running operations.

## Provider-neutral playlist state

JamRelay now has a shared provider-neutral playlist state reader. It centralizes:

- playlist metadata reads;
- complete playlist pagination;
- normalized ordered items;
- provider and connection provenance;
- provider revision identifiers;
- reusable state for automation, personalization, transfer and verification.

This removes several independent implementations of playlist pagination and reduces the risk of one workflow accidentally treating only the first provider page as the complete playlist.

## Playlist cache and singleflight

Large playlist workflows can reuse state when the provider exposes a trustworthy revision identifier.

JamRelay can avoid unnecessarily re-downloading an unchanged playlist and can share identical in-flight work inside one request through request-scoped singleflight.

Cache entries remain scoped to the provider and connection identity. Writes invalidate or refresh affected state rather than treating cached state as permanently authoritative.

## Playlist mutations

A shared playlist mutation service now provides a clearer execution lifecycle for supported operations:

```text
READ
  â†“
PLAN
  â†“
SNAPSHOT
  â†“
EXECUTE
  â†“
VERIFY
  â†“
RECORD
```

The service centralizes safety behavior that was previously duplicated across higher-level playlist workflows.

The release continues JamRelay's existing rule that correctness and deterministic ordering take priority over raw write throughput.

## Provider capabilities

Playlist capabilities are now more granular. Instead of treating playlist writes as one universal boolean, JamRelay can distinguish operations such as:

- create;
- add;
- remove;
- reorder;
- replace;
- update.

This allows unsupported operations to fail before inappropriate provider I/O is attempted.

Providers are still intentionally allowed to expose different capability surfaces.

## MCP authorization

Tool authorization metadata has been consolidated into a central tool manifest.

The manifest provides a common source for properties such as required permission, mutation classification, destructive behavior, toolset membership and capability requirements.

This reduces the chance that a newly added high-level tool is accidentally registered without an explicit authorization policy. Connection grants and provider targeting continue to fail closed.

## Durable jobs

Durable job resolution can now use controlled bounded batches while preserving persistent per-item progress.

Rate-limit detection can stop scheduling additional work and move the job into a waiting state instead of continuing to produce upstream pressure.

JamRelay still does not blindly repeat an externally uncertain provider write after a restart.

## Provider networking

Provider HTTP behavior is more consistent across adapters. The hardening work includes:

- request deadlines;
- cancellation propagation;
- bounded concurrency;
- safer retry boundaries;
- reduced provider fan-out;
- YouTube token-refresh singleflight;
- bounded YouTube playlist operations.

Provider-specific semantics remain inside provider adapters.

## Backup tooling

JamRelay now includes an application-aware backup command:

```bash
npm run backup
```

The backup flow is designed around SQLite consistency rather than blindly copying only the main database file while writes may still be active.

The `TOKEN_ENCRYPTION_KEY` must still be protected separately.

## Admin Console

JamRelay 1.3.0 substantially expands the owner administration interface.

The console now provides an operator-oriented application shell instead of only a few basic configuration pages. The administration surface includes views for:

- overview and system state;
- provider connections;
- MCP clients and grants;
- durable jobs;
- job details and operational actions;
- diagnostics;
- provider API errors;
- rate-limit state;
- MCP tool information;
- safe runtime/system information;
- backup-related operations where supported.

The admin interface uses self-hosted assets and a dedicated security policy.

Sensitive values such as provider tokens, MCP credentials, owner secrets and encryption keys are never intended to be rendered by the console.

## Security regression coverage

1.3.0 adds dedicated regression tests for several important trust boundaries, including:

- concurrent encrypted credential mutations;
- MCP authorization behavior;
- provider connection isolation;
- secret rendering canaries;
- request cancellation;
- playlist pagination;
- mutation ordering;
- singleflight behavior;
- backup contents;
- provider refresh concurrency;
- architectural provider-boundary rules.

## Architecture guardrails

New architecture tests protect important boundaries introduced during the provider-neutral migration.

Generic playlist and MCP domain code should not gradually drift back into direct provider-specific coupling without an explicit compatibility boundary.

Provider-specific behavior remains inside provider adapters and compatibility layers.

## Upgrade from 1.2.0

Before upgrading:

1. back up persistent JamRelay state;
2. preserve `TOKEN_ENCRYPTION_KEY`;
3. preserve provider credentials and MCP OAuth state;
4. preserve deployment secrets;
5. upgrade the application code/image;
6. run the release checks;
7. verify `/health`;
8. verify owner login and Admin Console access;
9. verify configured provider connections;
10. perform a read-only MCP smoke test before testing writes.

Recommended validation:

```bash
npm ci
npm run check
```

You can also create an application-aware backup before deployment:

```bash
npm run backup
```

## Compatibility

JamRelay 1.3.0 retains the provider-neutral direction introduced in 1.2.0.

The release does not add TIDAL support.

Spotify, SoundCloud, Apple Music and YouTube remain intentionally different providers with different authentication, quota and capability models.

Real provider OAuth, quota behavior, playback devices and hosted MCP-client compatibility still require manual verification with real accounts and credentials.

## Release boundary

This release deliberately does not:

- add TIDAL;
- expose provider credentials through the Admin Console;
- turn JamRelay into a distributed worker platform;
- replace SQLite with an external database;
- introduce unsafe parallel playlist ordering writes.

The focus of 1.3.0 is making the existing provider-neutral architecture safer, faster and substantially easier to operate.
