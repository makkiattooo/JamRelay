# Architektur

```mermaid
flowchart LR
  AI[KI-Client] --> Auth[Bearer oder MCP OAuth]
  Auth --> MCP[Express + MCP]
  MCP --> SpotifyAuth[Spotify OAuth]
  SpotifyAuth --> API[Spotify Web API]
  MCP --> Store[(Privates /data)]
```

`src/index.ts` startet Express und MCP. `src/mcp/tools.ts` und `src/mcp/helpers.ts` registrieren 39 Tools. `src/spotify/client.ts` behandelt Timeouts, sichere Retries und Fehlernormalisierung. Der Transport ist stateless; dauerhaft sind nur verschlüsselte Spotify-Tokens und MCP-OAuth-Daten.
