import path from 'node:path';
import { createApplicationBackup } from '../src/runtime/backup.js';

const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const dataDir = process.env.JAMRELAY_DATA_DIR?.trim() || path.resolve('data');
const databasePath = process.env.JAMRELAY_DB_PATH?.trim() || path.join(dataDir, 'jamrelay.db');
const outputDir = path.resolve(argument('--output') ?? path.join('backups', timestamp));
const result = await createApplicationBackup({
  databasePath,
  outputDir,
  credentialFiles: [
    {
      name: 'provider-credentials.json',
      path:
        process.env.PROVIDER_CREDENTIAL_STORE_PATH ??
        path.join(dataDir, 'provider-credentials.json'),
    },
    {
      name: 'mcp-oauth.json',
      path: process.env.MCP_OAUTH_STORE_PATH ?? path.join(dataDir, 'mcp-oauth.json'),
    },
    {
      name: 'mcp-oauth-clients.json',
      path: process.env.MCP_OAUTH_CLIENTS_PATH ?? path.join(dataDir, 'mcp-oauth-clients.json'),
    },
  ],
});
console.log(`Backup created: ${result.outputDir}`);
