import { selectOption, menuPanel, promptText } from './tui.js';
import { MCP_PERMISSIONS, type PermissionPolicy } from '../mcp/permissions.js';
import { hasToolSecurityMetadata } from '../mcp/tool-manifest.js';

export async function selectPermissions(
  current: string[],
  accounts: string[],
  selected: string[],
  allowedTools?: string[],
) {
  const scopes = new Set(current);
  const connections = new Set(selected);
  const options = [
    ...MCP_PERMISSIONS.map((id) => ({ id, kind: 'permission' })),
    ...accounts.map((id) => ({ id, kind: 'account' })),
  ];
  while (true) {
    const labels = options.map(
      ({ id, kind }) =>
        `${(kind === 'account' ? connections : scopes).has(id) ? '[x]' : '[ ]'} ${kind}: ${id}`,
    );
    labels.push('Apply selection', 'Cancel');
    const picked = await selectOption(
      labels.map((label, value) => ({ label, value })),
      0,
      (i) => menuPanel('MCP permissions — writes/destructive operations are optional', labels, i),
    );
    if (picked === undefined || picked === options.length + 1) throw new Error('CANCELLED');
    if (picked === options.length) break;
    const { id, kind } = options[picked];
    const set = kind === 'account' ? connections : scopes;
    if (set.has(id)) set.delete(id);
    else set.add(id);
  }
  const tools = await promptText(
    'Allowed tools: all or comma-separated names',
    allowedTools?.join(',') ?? 'all',
  );
  return { permissions: [...scopes], connectionIds: [...connections], tools: parseTools(tools) };
}
export function parseTools(value: string): string[] | undefined {
  if (value === 'all') return undefined;
  const names = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.some((name) => !hasToolSecurityMetadata(name))) throw new Error('INVALID_TOOL');
  return [...new Set(names)];
}
export function parsePolicy(permissions: string, tools?: string): PermissionPolicy {
  const scopes = permissions
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (scopes.some((s) => !(MCP_PERMISSIONS as readonly string[]).includes(s)))
    throw new Error('INVALID_PERMISSION');
  return {
    permissions: [...new Set(scopes)],
    ...(tools !== undefined ? { tools: parseTools(tools) } : {}),
  };
}
