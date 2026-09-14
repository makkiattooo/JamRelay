import { AsyncLocalStorage } from 'node:async_hooks';

export type ToolContext = {
  requestId: string;
  signal: AbortSignal;
  deadlineAt: number;
  operation?: string;
  mcpAccess?: {
    clientId: string;
    connectionIds?: string[];
    permissions?: string[];
  };
};
const storage = new AsyncLocalStorage<ToolContext>();

export const toolContext = {
  get: () => storage.getStore(),
  run<T>(context: ToolContext, callback: () => Promise<T>) {
    return storage.run(context, callback);
  },
};
