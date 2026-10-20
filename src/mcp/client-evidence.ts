import { getDatabase, isDatabaseInitialized } from '../db/database.js';

export function recordDiscovery(clientId: string, body: string) {
  if (!isDatabaseInitialized() || body.length > 262144) return;
  try {
    const json = body.trim().startsWith('{')
      ? body
      : body
          .split('\n')
          .find((line) => line.startsWith('data:'))
          ?.slice(5);
    const result = JSON.parse(json || '{}');
    if (!Array.isArray(result.result?.tools) || !result.result.tools.length || result.error) return;
    getDatabase()
      .prepare(
        'INSERT INTO mcp_client_discovery (client_id, verified_at, tool_count) VALUES (?, ?, ?) ON CONFLICT(client_id) DO UPDATE SET verified_at=excluded.verified_at, tool_count=excluded.tool_count',
      )
      .run(clientId, Date.now(), result.result.tools.length);
  } catch {
    /* Evidence is optional and must never affect MCP responses. */
  }
}
export function discoveryFor(clientId: string, after: number) {
  if (!isDatabaseInitialized()) return undefined;
  return getDatabase()
    .prepare(
      'SELECT verified_at, tool_count FROM mcp_client_discovery WHERE client_id=? AND verified_at>=?',
    )
    .get(clientId, after) as { verified_at: number; tool_count: number } | undefined;
}
