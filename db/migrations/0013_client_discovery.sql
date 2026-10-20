-- Evidence only: no tokens, secrets, tool arguments or provider data.
CREATE TABLE IF NOT EXISTS mcp_client_discovery (
  client_id TEXT PRIMARY KEY,
  verified_at INTEGER NOT NULL,
  tool_count INTEGER NOT NULL
);
