import { AsyncLocalStorage } from 'node:async_hooks';
import type { Singleflight } from '../utils/singleflight.js';

export type ToolContext = {
  requestId: string;
  signal: AbortSignal;
  deadlineAt: number;
  operation?: string;
  writeAllowed?: boolean;
  queueJobId?: number;
  singleflight?: Singleflight;
  mcpAccess?: McpAccess;
  resolveAccess?: () => Promise<McpAccess | undefined>;
};
const storage = new AsyncLocalStorage<ToolContext>();

export const toolContext = {
  get: () => storage.getStore(),
  run<T>(context: ToolContext, callback: () => Promise<T>) {
    const parent = storage.getStore();
    if (parent?.mcpAccess) {
      context = {
        ...context,
        mcpAccess: intersectAccess(parent.mcpAccess, context.mcpAccess ?? parent.mcpAccess),
        resolveAccess: parent.resolveAccess ?? context.resolveAccess,
        writeAllowed: parent.writeAllowed === false ? false : context.writeAllowed,
      };
    } else if (parent?.resolveAccess) {
      throw new Error('CLIENT_REVOKED');
    }
    return storage.run(context, callback);
  },
};

export type McpAccess = {
  clientId: string;
  issuedAt?: number;
  connectionIds?: string[];
  permissions?: string[];
  tools?: string[];
};

/** Authorization may only narrow during one request/job, including delegated contexts. */
export function intersectAccess(ceiling: McpAccess, current: McpAccess): McpAccess {
  if (ceiling.clientId !== current.clientId) throw new Error('CLIENT_REVOKED');
  return {
    ...current,
    clientId: ceiling.clientId,
    issuedAt: ceiling.issuedAt,
    permissions: (current.permissions ?? []).filter((p) => ceiling.permissions?.includes(p)),
    connectionIds: (current.connectionIds ?? []).filter((id) =>
      ceiling.connectionIds?.includes(id),
    ),
    tools:
      ceiling.tools && current.tools
        ? current.tools.filter((name) => ceiling.tools!.includes(name))
        : ceiling.tools
          ? [...ceiling.tools]
          : current.tools
            ? [...current.tools]
            : undefined,
  };
}
