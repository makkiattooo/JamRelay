---
title: TIDAL feasibility gate
description: Legal and technical gate for a possible future TIDAL integration.
---

# TIDAL feasibility gate

## Result: `REQUIRES_WRITTEN_APPROVAL`

No TIDAL adapter, runtime configuration, dependency, environment variable or
branding is included in this phase.

### Legal finding

The current [TIDAL Developer Guidelines](https://developer.tidal.com/documentation/guidelines/guidelines-developer-guidelines), incorporated into the Developer Terms, list as prohibited offerings—unless TIDAL gives express written approval—an offering that uses TIDAL content in connection with artificial intelligence or machine intelligence technologies. The same section separately prohibits enabling transfer of data to another service and analyzing TIDAL content. These restrictions cover metadata/catalog and playlist data, not only audio playback: TIDAL's [Design Guidelines](https://developer.tidal.com/documentation/guidelines-design-guidelines-1_0) expressly describe track, artist, playlist and album titles supplied by the API as TIDAL content.

Short relevant excerpts:

> “in connection with any artificial intelligence or machine intelligence technologies”

> “Enabling the transfer of data to another service”

The exception is expressly written approval from TIDAL. No approval is present
in this repository or in the reviewed public documentation. Self-hosted or
personal use does not remove the Developer Terms requirement. An MCP tool
operated by an AI client remains an AI-connected offering for this gate.

### Technical finding

TIDAL technically documents OAuth 2.1, Authorization Code and refresh-token
flows, PKCE, client-credentials catalog access, and bearer-token API calls in
its [Authorization documentation](https://developer.tidal.com/documentation/api-sdk/api-sdk-authorization).
The [Quick Start](https://developer.tidal.com/documentation/api-sdk/api-sdk-quick-start)
also documents catalog API access. Technical availability is not permission to
use the content in JamRelay's AI/MCP workflow.

### Decision and required next step

The decision is `REQUIRES_WRITTEN_APPROVAL`, rather than `ALLOWED_WITH_CONSTRAINTS`,
because the documented prohibition directly matches JamRelay's AI/MCP control
surface and its cross-service transfer/planning behavior. It is not marked
`BLOCKED` because the Guidelines provide an express-written-approval path.

Before any future implementation, obtain written approval that specifically
covers: AI/MCP operation, metadata/catalog and playlist reads/writes, any
cross-provider transfer, storage/retention, end-user data handling, and the
required TIDAL attribution/branding. Until then, do not add TIDAL code or
expose TIDAL data through JamRelay.
