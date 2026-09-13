import { it, expect } from 'vitest';
import { REQUIRED_TOOL_NAMES } from '../src/mcp/tools.js';
it('defines exactly the required 39 MCP tools without duplicates', () => {
  expect(REQUIRED_TOOL_NAMES).toHaveLength(40);
  expect(new Set(REQUIRED_TOOL_NAMES).size).toBe(40);
});
