import { chmod, copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type ApplicationBackupOptions = {
  databasePath: string;
  outputDir: string;
  credentialFiles: Array<{ name: string; path: string }>;
};

export type ApplicationBackupResult = {
  outputDir: string;
  files: Array<{ name: string; bytes: number }>;
};

export type ApplicationBackupSummary = {
  name: string;
  createdAt: string;
  bytes: number;
  valid: boolean;
};

export async function createApplicationBackup(
  options: ApplicationBackupOptions,
): Promise<ApplicationBackupResult> {
  const databasePath = path.resolve(options.databasePath);
  const outputDir = path.resolve(options.outputDir);
  if (!existsSync(databasePath)) throw new Error('State DB does not exist.');
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const destinationDb = path.join(outputDir, 'jamrelay.db');
  const source = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const escaped = destinationDb.replaceAll("'", "''");
    source.exec(`VACUUM INTO '${escaped}'`);
  } finally {
    source.close();
  }
  await chmod(destinationDb, 0o600);
  const included: Array<{ name: string; bytes: number }> = [
    { name: 'jamrelay.db', bytes: (await stat(destinationDb)).size },
  ];
  for (const file of options.credentialFiles) {
    const sourcePath = path.resolve(file.path);
    if (!existsSync(sourcePath)) continue;
    const destination = path.join(outputDir, file.name);
    await copyFile(sourcePath, destination);
    await chmod(destination, 0o600);
    included.push({ name: file.name, bytes: (await stat(destination)).size });
  }
  await writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(
      {
        format: 1,
        created_at: new Date().toISOString(),
        schema: 'application-consistent-sqlite-vacuum',
        encryption_key_included: false,
        files: included,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  return { outputDir, files: included };
}

export async function listApplicationBackups(
  baseOutputDir: string,
): Promise<ApplicationBackupSummary[]> {
  const root = path.resolve(baseOutputDir);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const summaries: ApplicationBackupSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(root, entry.name);
    const manifestPath = path.join(directory, 'manifest.json');
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        created_at?: unknown;
        files?: unknown;
        encryption_key_included?: unknown;
      };
      const files = Array.isArray(manifest.files) ? manifest.files : [];
      const bytes = (
        await Promise.all(
          files.map(async (file: any) => {
            try {
              return (await stat(path.join(directory, String(file.name)))).size;
            } catch {
              return 0;
            }
          }),
        )
      ).reduce((total, value) => total + value, 0);
      summaries.push({
        name: entry.name,
        createdAt: typeof manifest.created_at === 'string' ? manifest.created_at : 'unknown',
        bytes,
        valid:
          manifest.encryption_key_included === false &&
          files.some((file: any) => file.name === 'jamrelay.db'),
      });
    } catch {
      summaries.push({ name: entry.name, createdAt: 'unknown', bytes: 0, valid: false });
    }
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
}
