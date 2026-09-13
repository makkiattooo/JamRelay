import { afterEach, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  checksumMigration,
  closeDatabase,
  getCurrentSchemaVersion,
  getDatabase,
  getDatabaseStatus,
  getDatabasePath,
  getExpectedSchemaVersion,
  initializeDatabase,
} from '../src/db/database.js';

const repositoryMigration = join(process.cwd(), 'db', 'migrations', '0001_state_db.sql');

async function fixtureDirectory(...migrations: Array<[string, string]>) {
  const root = await mkdtemp(join(tmpdir(), 'tunelink-db-'));
  const directory = join(root, 'migrations');
  await mkdir(directory);
  for (const [filename, content] of migrations) await writeFile(join(directory, filename), content);
  return { root, directory };
}

afterEach(() => closeDatabase());

describe('TuneLink State DB', () => {
  it('initializes all state tables in temporary storage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tunelink-db-'));
    try {
      const db = initializeDatabase({
        dataDir: root,
        migrationsDir: join(process.cwd(), 'db/migrations'),
      });
      const tables = (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
          name: string;
        }>
      ).map((row) => row.name);
      expect(tables).toEqual(
        expect.arrayContaining([
          'schema_migrations',
          'tracks',
          'track_aliases',
          'resolver_attempts',
          'api_errors',
          'rate_limit_state',
          'jobs',
          'job_items',
        ]),
      );
      expect(getDatabasePath()).toBe(join(root, 'tunelink.db'));
    } finally {
      closeDatabase();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stores a deterministic lowercase SHA-256 checksum', async () => {
    const content = await readFile(repositoryMigration, 'utf8');
    const { root, directory } = await fixtureDirectory(['0001_state_db.sql', content]);
    try {
      const db = initializeDatabase({ dataDir: root, migrationsDir: directory });
      expect(db.prepare('PRAGMA table_info(schema_migrations)').all()).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'checksum' })]),
      );
      expect(db.prepare('SELECT version, checksum FROM schema_migrations').all()).toEqual([
        {
          version: '0001_state_db.sql',
          checksum: createHash('sha256').update(content).digest('hex'),
        },
      ]);
      expect(checksumMigration(content)).toBe(checksumMigration(content));
      expect(checksumMigration(content)).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      closeDatabase();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('detects modified and missing applied migration files', async () => {
    const content = 'CREATE TABLE marker (id INTEGER);\n';
    const first = await fixtureDirectory(['0001_marker.sql', content]);
    try {
      initializeDatabase({ dataDir: first.root, migrationsDir: first.directory });
      closeDatabase();
      await writeFile(join(first.directory, '0001_marker.sql'), content + '-- changed\n');
      expect(() =>
        initializeDatabase({ dataDir: first.root, migrationsDir: first.directory }),
      ).toThrow(/has been modified/);
    } finally {
      closeDatabase();
      await rm(first.root, { recursive: true, force: true });
    }

    const second = await fixtureDirectory(
      ['0001_marker.sql', content],
      ['0002_known.sql', 'CREATE TABLE known_marker (id INTEGER);\n'],
    );
    try {
      initializeDatabase({ dataDir: second.root, migrationsDir: second.directory });
      closeDatabase();
      await rm(join(second.directory, '0001_marker.sql'));
      expect(() =>
        initializeDatabase({ dataDir: second.root, migrationsDir: second.directory }),
      ).toThrow(/missing/);
    } finally {
      closeDatabase();
      await rm(second.root, { recursive: true, force: true });
    }
  });

  it('applies new migrations in deterministic order and reports schema versions', async () => {
    const base = await readFile(repositoryMigration, 'utf8');
    const { root, directory } = await fixtureDirectory(
      ['0001_state_db.sql', base],
      [
        '0002_second.sql',
        'CREATE TABLE migration_order (value INTEGER); INSERT INTO migration_order VALUES (2);\n',
      ],
      ['0003_third.sql', 'INSERT INTO migration_order VALUES (3);\n'],
    );
    try {
      const db = initializeDatabase({ dataDir: root, migrationsDir: directory });
      expect(getCurrentSchemaVersion()).toBe('0003_third.sql');
      expect(getExpectedSchemaVersion(directory)).toBe('0003_third.sql');
      expect(getDatabaseStatus()).toEqual({
        ready: true,
        currentVersion: '0003_third.sql',
        expectedVersion: '0003_third.sql',
        schemaState: 'current',
      });
      expect(db.prepare('SELECT value FROM migration_order').all()).toEqual([
        { value: 2 },
        { value: 3 },
      ]);
    } finally {
      closeDatabase();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows an older build to start with a verified future schema', async () => {
    const base = await readFile(repositoryMigration, 'utf8');
    const newer = await fixtureDirectory(
      ['0001_state_db.sql', base],
      ['0002_future.sql', 'CREATE TABLE future_marker (id INTEGER);\n'],
    );
    const older = await fixtureDirectory(['0001_state_db.sql', base]);
    try {
      initializeDatabase({ dataDir: newer.root, migrationsDir: newer.directory });
      closeDatabase();
      const db = initializeDatabase({ dataDir: newer.root, migrationsDir: older.directory });
      expect(getDatabaseStatus()).toEqual({
        ready: true,
        currentVersion: '0002_future.sql',
        expectedVersion: '0001_state_db.sql',
        schemaState: 'ahead',
      });
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE name = 'future_marker'").get(),
      ).toEqual({ name: 'future_marker' });
    } finally {
      closeDatabase();
      await rm(newer.root, { recursive: true, force: true });
      await rm(older.root, { recursive: true, force: true });
    }
  });

  it('still verifies known checksums when unknown future migrations exist', async () => {
    const base = await readFile(repositoryMigration, 'utf8');
    const newer = await fixtureDirectory(
      ['0001_state_db.sql', base],
      ['0002_future.sql', 'CREATE TABLE future_marker (id INTEGER);\n'],
    );
    const older = await fixtureDirectory(['0001_state_db.sql', base + '-- modified\n']);
    try {
      initializeDatabase({ dataDir: newer.root, migrationsDir: newer.directory });
      closeDatabase();
      expect(() =>
        initializeDatabase({ dataDir: newer.root, migrationsDir: older.directory }),
      ).toThrow(/has been modified/);
    } finally {
      closeDatabase();
      await rm(newer.root, { recursive: true, force: true });
      await rm(older.root, { recursive: true, force: true });
    }
  });

  it('rejects a future schema when a known migration was skipped', async () => {
    const base = await readFile(repositoryMigration, 'utf8');
    const newer = await fixtureDirectory(
      ['0001_state_db.sql', base],
      ['0003_future.sql', 'CREATE TABLE future_marker (id INTEGER);\n'],
    );
    const current = await fixtureDirectory(
      ['0001_state_db.sql', base],
      ['0002_known.sql', 'CREATE TABLE known_marker (id INTEGER);\n'],
    );
    try {
      initializeDatabase({ dataDir: newer.root, migrationsDir: newer.directory });
      closeDatabase();
      expect(() =>
        initializeDatabase({ dataDir: newer.root, migrationsDir: current.directory }),
      ).toThrow(/was not applied before future schema state/);
    } finally {
      closeDatabase();
      await rm(newer.root, { recursive: true, force: true });
      await rm(current.root, { recursive: true, force: true });
    }
  });

  it('rejects invalid and duplicate migration names', async () => {
    const invalid = await fixtureDirectory(['0001_bad.sql', ''], ['oops.sql', '']);
    try {
      expect(() =>
        initializeDatabase({ dataDir: invalid.root, migrationsDir: invalid.directory }),
      ).toThrow(/Invalid migration filename/);
    } finally {
      await rm(invalid.root, { recursive: true, force: true });
    }
    const duplicate = await fixtureDirectory(['0001_one.sql', ''], ['0001_two.sql', '']);
    try {
      expect(() =>
        initializeDatabase({ dataDir: duplicate.root, migrationsDir: duplicate.directory }),
      ).toThrow(/Duplicate migration numeric prefix/);
    } finally {
      await rm(duplicate.root, { recursive: true, force: true });
    }
  });

  it('rejects duplicate applied prefixes and malformed applied versions', async () => {
    const fixture = await fixtureDirectory([
      '0001_marker.sql',
      'CREATE TABLE marker (id INTEGER);\n',
    ]);
    const db = new DatabaseSync(join(fixture.root, 'tunelink.db'));
    db.exec(
      'CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, provenance TEXT NOT NULL, applied_at INTEGER NOT NULL);',
    );
    const insert = db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?, ?)');
    insert.run(
      '0001_marker.sql',
      checksumMigration('CREATE TABLE marker (id INTEGER);\n'),
      'verified',
      Date.now(),
    );
    insert.run('0002_future_a.sql', 'a'.repeat(64), 'verified', Date.now());
    insert.run('0002_future_b.sql', 'b'.repeat(64), 'verified', Date.now());
    db.close();
    try {
      expect(() =>
        initializeDatabase({ dataDir: fixture.root, migrationsDir: fixture.directory }),
      ).toThrow(/Duplicate applied migration numeric prefix: 0002/);
    } finally {
      closeDatabase();
      await rm(fixture.root, { recursive: true, force: true });
    }

    const malformed = await fixtureDirectory([
      '0001_marker.sql',
      'CREATE TABLE marker (id INTEGER);\n',
    ]);
    const malformedDb = new DatabaseSync(join(malformed.root, 'tunelink.db'));
    malformedDb.exec(
      'CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, provenance TEXT NOT NULL, applied_at INTEGER NOT NULL);',
    );
    malformedDb
      .prepare('INSERT INTO schema_migrations VALUES (?, ?, ?, ?)')
      .run('not-a-migration', 'c'.repeat(64), 'verified', Date.now());
    malformedDb.close();
    try {
      expect(() =>
        initializeDatabase({ dataDir: malformed.root, migrationsDir: malformed.directory }),
      ).toThrow(/Malformed applied migration version/);
    } finally {
      closeDatabase();
      await rm(malformed.root, { recursive: true, force: true });
    }
  });

  it('rolls back failed migrations and does not record them', async () => {
    const fixture = await fixtureDirectory([
      '0001_broken.sql',
      'CREATE TABLE partial (id INTEGER);\nINVALID SQL;',
    ]);
    try {
      expect(() =>
        initializeDatabase({ dataDir: fixture.root, migrationsDir: fixture.directory }),
      ).toThrow(/Database migration failed/);
      const failedDb = new DatabaseSync(join(fixture.root, 'tunelink.db'));
      expect(
        failedDb.prepare("SELECT name FROM sqlite_master WHERE name = 'partial'").get(),
      ).toBeUndefined();
      expect(failedDb.prepare('SELECT * FROM schema_migrations').all()).toEqual([]);
      failedDb.close();
    } finally {
      closeDatabase();
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('upgrades a legacy schema_migrations table with the repository checksum', async () => {
    const content = 'CREATE TABLE marker (id INTEGER);\n';
    const fixture = await fixtureDirectory(['0001_marker.sql', content]);
    const legacyDb = new DatabaseSync(join(fixture.root, 'tunelink.db'));
    legacyDb.exec(
      'CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);',
    );
    legacyDb
      .prepare('INSERT INTO schema_migrations VALUES (?, ?)')
      .run('0001_marker.sql', Date.now());
    legacyDb.close();
    try {
      const db = initializeDatabase({ dataDir: fixture.root, migrationsDir: fixture.directory });
      expect(
        db.prepare('SELECT version, checksum, provenance FROM schema_migrations').all(),
      ).toEqual([
        {
          version: '0001_marker.sql',
          checksum: checksumMigration(content),
          provenance: 'legacy_backfilled',
        },
      ]);
      expect(getDatabaseStatus().ready).toBe(true);
    } finally {
      closeDatabase();
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('configures SQLite and supports close/reopen', async () => {
    const content = 'CREATE TABLE marker (id INTEGER);\n';
    const fixture = await fixtureDirectory(['0001_marker.sql', content]);
    try {
      const db = initializeDatabase({ dataDir: fixture.root, migrationsDir: fixture.directory });
      expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
      expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
      expect(db.prepare('PRAGMA busy_timeout').get()).toEqual({ timeout: 5000 });
      closeDatabase();
      expect(() => getDatabase()).toThrow(/not been initialized/);
      initializeDatabase({ dataDir: fixture.root, migrationsDir: fixture.directory });
      expect(getDatabaseStatus().ready).toBe(true);
    } finally {
      closeDatabase();
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});
