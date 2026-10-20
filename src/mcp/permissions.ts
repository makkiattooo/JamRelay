import { toolContext, type McpAccess } from './context.js';
import { getToolSecurityMetadata } from './tool-manifest.js';

export const MCP_PERMISSIONS = [
  'catalog.read',
  'library.read',
  'library.write',
  'playlist.read',
  'playlist.write',
  'playlist.destructive',
  'playback.read',
  'playback.control',
  'personalization.read',
  'transfer.plan',
  'transfer.execute',
  'diagnostics.read',
] as const;
export const READ_ONLY_PERMISSIONS = MCP_PERMISSIONS.filter(
  (p) => p.endsWith('.read') || p === 'transfer.plan',
);
export type PermissionPolicy = { permissions: string[]; tools?: string[] };

/** One policy boundary for every authenticated MCP application, regardless of its claimed name. */
export class McpPermissionEngine {
  static allows(access: McpAccess, tool: string) {
    const metadata = getToolSecurityMetadata(tool);
    return Boolean(
      metadata &&
      access.permissions?.includes(metadata.permission) &&
      (!metadata.destructive ||
        metadata.permission === 'library.write' ||
        access.permissions?.includes('playlist.destructive')) &&
      (!access.tools || access.tools.includes(tool)),
    );
  }
  static assert(access: McpAccess, tool: string, connections: string[] = []) {
    if (!this.allows(access, tool)) throw new Error('PERMISSION_NOT_GRANTED');
    if (connections.some((id) => !access.connectionIds?.includes(id)))
      throw new Error('CONNECTION_NOT_GRANTED');
  }
  static async current(): Promise<McpAccess | undefined> {
    const context = toolContext.get();
    if (!context?.mcpAccess) return undefined; // trusted local operator, not an MCP request
    if (!context.resolveAccess) return context.mcpAccess;
    const access = await context.resolveAccess();
    if (!access) throw new Error('CLIENT_REVOKED');
    // A nested operation may narrow its target but can never expand the original grant.
    const allowed = context.mcpAccess.connectionIds;
    return {
      ...access,
      connectionIds: access.connectionIds?.filter((id) => !allowed || allowed.includes(id)),
    };
  }
  static async enforceWrite(connections: string[] = [], destructive = false) {
    const access = await this.enforce(undefined, connections);
    if (access) {
      const metadata = getToolSecurityMetadata(toolContext.get()?.operation ?? '');
      if (!metadata || metadata.readOnly) throw new Error('PERMISSION_NOT_GRANTED');
      if (destructive && !access.permissions?.includes('playlist.destructive'))
        throw new Error('PERMISSION_NOT_GRANTED');
    }
  }
  static async enforce(tool?: string, connections: string[] = []) {
    const access = await this.current();
    if (access) {
      const operation = tool ?? toolContext.get()?.operation;
      if (!operation) throw new Error('PERMISSION_NOT_GRANTED');
      this.assert(access, operation, connections);
      toolContext.get()!.mcpAccess = access;
    }
    return access;
  }
}
