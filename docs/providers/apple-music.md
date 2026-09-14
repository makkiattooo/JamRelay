# Apple Music provider

Apple Music has a different trust model from OAuth providers. Configure
`APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, and
`APPLE_MUSIC_PRIVATE_KEY_PATH` together; `APPLE_MUSIC_STOREFRONT` defaults to
`us`.

The server reads the Apple Media Services private `.p8` key and signs a short
lived Developer Token. The key must remain outside source control with strict
filesystem permissions. A Music User Token is obtained through a MusicKit/client
context; JamRelay cannot mint it on the server. Submit it through the
owner-protected onboarding flow, where it is stored encrypted in the provider
credential store.

Catalog access uses the Developer Token. User-library or user-specific actions
require a valid Music User Token. Token presence is provider connectivity, not
server health. Storefront affects catalog regional results; it is not a
credential.
