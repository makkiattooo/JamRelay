import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const run = promisify(execFile);
let roots: string[] = [];

afterEach(async () => {
  for (const root of roots) {
    await import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true }));
  }
  roots = [];
});

describe('application-aware backup', () => {
  it('creates a restrictive, manifest-backed backup without encryption material', async () => {
    const root = await mkdtemp(join(process.cwd(), 'tmp-backup-test-'));
    roots.push(root);
    const dataDir = join(root, 'data');
    const output = join(root, 'backup');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dataDir, { recursive: true });
    const db = new DatabaseSync(join(dataDir, 'jamrelay.db'));
    db.exec('CREATE TABLE marker (value TEXT)');
    db.prepare('INSERT INTO marker VALUES (?)').run('safe');
    db.close();
    await writeFile(join(dataDir, 'provider-credentials.json'), 'encrypted-placeholder');
    const script = join(process.cwd(), 'scripts', 'backup.ts');
    await run(process.execPath, ['--import', 'tsx', script, '--output', output], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        JAMRELAY_DATA_DIR: dataDir,
        JAMRELAY_DB_PATH: join(dataDir, 'jamrelay.db'),
      },
    });
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
    expect(manifest.encryption_key_included).toBe(false);
    expect(JSON.stringify(manifest)).not.toContain(dataDir);
    expect(manifest.files.map((file: { name: string }) => file.name)).toContain('jamrelay.db');
    expect(manifest.files.map((file: { name: string }) => file.name)).toContain(
      'provider-credentials.json',
    );
    expect(await stat(join(output, 'jamrelay.db'))).toMatchObject({ mode: expect.any(Number) });
    if (process.platform !== 'win32')
      expect((await stat(join(output, 'jamrelay.db'))).mode & 0o077).toBe(0);
    expect(await readFile(join(output, 'provider-credentials.json'), 'utf8')).toBe(
      'encrypted-placeholder',
    );
  });
});
