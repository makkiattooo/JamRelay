import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';

export type { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);

/** Importing CLI helpers must not initialize experimental SQLite or emit its async warning. */
export function openSqlite(...args: ConstructorParameters<typeof DatabaseSync>): DatabaseSync {
  const sqlite = require('node:sqlite') as typeof import('node:sqlite');
  return new sqlite.DatabaseSync(...args);
}
