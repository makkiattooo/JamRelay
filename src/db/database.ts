import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Logger } from 'pino';

export type DatabaseOptions = {
  dataDir?: string;
  dbPath?: string;
  migrationsDir?: string;
  logger?: Pick<Logger, 'info' | 'error'>;
};

export type DatabaseStatus = {
  ready: boolean;
  currentVersion: string | null;
  expectedVersion: string | null;
  schemaState: 'current' | 'ahead' | 'behind' | 'unknown';
};

type MigrationFile = { version: string; checksum: string; path: string; numericPrefix: number };
type AppliedMigration = {
  version: string;
  checksum: string | null;
  provenance?: string | null;
};

const migrationPattern = /^(\d{4})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const defaultDataDir = () =>
  process.env.TUNELINK_DATA_DIR?.trim() || path.resolve(process.cwd(), 'data');
const defaultDbPath = (dataDir: string) =>
  process.env.TUNELINK_DB_PATH?.trim() || path.join(dataDir, 'tunelink.db');
const defaultMigrationsDir = () => path.resolve(process.cwd(), 'db', 'migrations');

function parseMigrationVersion(version: string): number {
  const match = migrationPattern.exec(version);
  if (!match) throw new Error(`Malformed applied migration version: ${version}`);
  return Number(match[1]);
}

let database: DatabaseSync | null = null;
let databasePath: string | null = null;
let migrationsDirectory: string | null = null;

export function checksumMigration(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function configureDatabase(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA wal_autocheckpoint = 1000;
  `);
}

function readMigrationFiles(directory: string): MigrationFile[] {
  if (!fs.existsSync(directory))
    throw new Error(`Database migrations directory does not exist: ${directory}`);
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const sqlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'));
  const seenPrefixes = new Set<string>();
  const migrations = sqlFiles.map((entry) => {
    const match = migrationPattern.exec(entry.name);
    if (!match) throw new Error(`Invalid migration filename: ${entry.name}`);
    if (seenPrefixes.has(match[1]))
      throw new Error(`Duplicate migration numeric prefix: ${match[1]}`);
    seenPrefixes.add(match[1]);
    const migrationPath = path.join(directory, entry.name);
    return {
      version: entry.name,
      checksum: checksumMigration(fs.readFileSync(migrationPath, 'utf8')),
      path: migrationPath,
      numericPrefix: Number(match[1]),
    };
  });
  return migrations.sort((a, b) => a.version.localeCompare(b.version, 'en'));
}

function ensureMigrationTable(db: DatabaseSync, migrations: MigrationFile[]): void {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!table) {
    db.exec(`
      CREATE TABLE schema_migrations (
        version TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        provenance TEXT NOT NULL DEFAULT 'verified',
        applied_at INTEGER NOT NULL
      );
    `);
    return;
  }

  const columns = db.prepare('PRAGMA table_info(schema_migrations)').all() as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((column) => column.name));
  if (!names.has('version') || !names.has('applied_at'))
    throw new Error('schema_migrations is missing required columns');
  if (names.has('checksum') && names.has('provenance')) return;

  db.exec('BEGIN IMMEDIATE');
  try {
    const checksumless = !names.has('checksum');
    if (checksumless) db.exec('ALTER TABLE schema_migrations ADD COLUMN checksum TEXT');
    if (!names.has('provenance')) {
      const defaultProvenance = checksumless ? 'legacy_backfilled' : 'verified';
      db.exec(
        `ALTER TABLE schema_migrations ADD COLUMN provenance TEXT NOT NULL DEFAULT '${defaultProvenance}'`,
      );
    }
    if (checksumless) {
      const rows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{
        version: string;
      }>;
      const byVersion = new Map(
        migrations.map((migration) => [migration.version, migration.checksum]),
      );
      const update = db.prepare(
        'UPDATE schema_migrations SET checksum = ?, provenance = ? WHERE version = ?',
      );
      for (const row of rows) {
        const checksum = byVersion.get(row.version);
        if (!checksum) throw new Error(`Applied migration file is missing: ${row.version}`);
        update.run(checksum, 'legacy_backfilled', row.version);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the original registry upgrade error.
    }
    throw error;
  }
}

function readAppliedMigrations(db: DatabaseSync): AppliedMigration[] {
  return db
    .prepare('SELECT version, checksum, provenance FROM schema_migrations ORDER BY version')
    .all() as AppliedMigration[];
}

function verifyAppliedMigrations(
  applied: AppliedMigration[],
  migrations: MigrationFile[],
): Set<string> {
  const available = new Map(migrations.map((migration) => [migration.version, migration]));
  const appliedVersions = new Set<string>();
  const latestLocalPrefix = migrations.at(-1)?.numericPrefix ?? 0;
  const appliedPrefixes = applied.map((row) => parseMigrationVersion(row.version));
  const latestAppliedPrefix = Math.max(0, ...appliedPrefixes);
  const hasFutureMigration = latestAppliedPrefix > latestLocalPrefix;
  const seenVersions = new Set<string>();
  const seenPrefixes = new Set<number>();
  for (const row of applied) {
    if (seenVersions.has(row.version))
      throw new Error(`Duplicate applied migration version: ${row.version}`);
    seenVersions.add(row.version);
    const migration = available.get(row.version);
    const prefix = parseMigrationVersion(row.version);
    if (seenPrefixes.has(prefix))
      throw new Error(
        `Duplicate applied migration numeric prefix: ${String(prefix).padStart(4, '0')}`,
      );
    seenPrefixes.add(prefix);
    if (!row.checksum || !/^[a-f0-9]{64}$/.test(row.checksum))
      throw new Error(`Applied migration ${row.version} has invalid checksum metadata`);
    if (migration) {
      if (row.checksum !== migration.checksum)
        throw new Error(`Applied migration ${row.version} has been modified`);
    } else if (prefix <= latestLocalPrefix) {
      throw new Error(`Applied migration file is missing: ${row.version}`);
    }
    appliedVersions.add(row.version);
  }
  if (hasFutureMigration) {
    for (const migration of migrations) {
      if (!appliedVersions.has(migration.version))
        throw new Error(
          `Known migration ${migration.version} was not applied before future schema state`,
        );
    }
  } else if (latestAppliedPrefix > 0) {
    for (const migration of migrations) {
      if (migration.numericPrefix <= latestAppliedPrefix && !appliedVersions.has(migration.version))
        throw new Error(
          `Known migration ${migration.version} is missing before current schema state`,
        );
    }
  }
  return appliedVersions;
}

function migrateDatabase(
  db: DatabaseSync,
  migrations: MigrationFile[],
  logger?: Pick<Logger, 'info' | 'error'>,
): number {
  ensureMigrationTable(db, migrations);
  const appliedVersions = verifyAppliedMigrations(readAppliedMigrations(db), migrations);
  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, checksum, provenance, applied_at) VALUES (?, ?, ?, ?)',
  );
  let appliedCount = 0;
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    const sql = fs.readFileSync(migration.path, 'utf8');
    logger?.info(
      { event: 'db_migration_start', migration: migration.version },
      'Applying database migration',
    );
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      insertMigration.run(migration.version, migration.checksum, 'verified', Date.now());
      db.exec('COMMIT');
      appliedCount += 1;
      logger?.info(
        { event: 'db_migration_applied', migration: migration.version },
        'Database migration applied',
      );
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Preserve the migration error if rollback itself cannot be completed.
      }
      throw new Error(`Database migration failed: ${migration.version}`, { cause: error });
    }
  }
  return appliedCount;
}

export function initializeDatabase(options: DatabaseOptions = {}): DatabaseSync {
  if (database) return database;
  const dataDir = options.dataDir ?? defaultDataDir();
  const resolvedPath = options.dbPath ?? defaultDbPath(dataDir);
  const resolvedMigrationsDir = options.migrationsDir ?? defaultMigrationsDir();
  const migrations = readMigrationFiles(resolvedMigrationsDir);
  if (migrations.length === 0 && !fs.existsSync(resolvedPath))
    throw new Error('No database migrations found');
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const db = new DatabaseSync(resolvedPath);
  try {
    configureDatabase(db);
    const appliedCount = migrateDatabase(db, migrations, options.logger);
    database = db;
    databasePath = resolvedPath;
    migrationsDirectory = resolvedMigrationsDir;
    options.logger?.info(
      { event: 'db_ready', database_path: resolvedPath, migrations_applied: appliedCount },
      'State DB ready',
    );
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function getDatabase(): DatabaseSync {
  if (!database) throw new Error('TuneLink database has not been initialized.');
  return database;
}

export function getExpectedSchemaVersion(
  directory = migrationsDirectory ?? defaultMigrationsDir(),
): string {
  const migrations = readMigrationFiles(directory);
  if (migrations.length === 0) throw new Error('No database migrations found');
  return migrations.at(-1)!.version;
}

export function getCurrentSchemaVersion(): string | null {
  if (!database) return null;
  const rows = readAppliedMigrations(database).sort(
    (a, b) => parseMigrationVersion(a.version) - parseMigrationVersion(b.version),
  );
  return rows.at(-1)?.version ?? null;
}

export function getDatabaseStatus(): DatabaseStatus {
  const expectedVersion = getExpectedSchemaVersion();
  const currentVersion = getCurrentSchemaVersion();
  const currentPrefix = currentVersion ? parseMigrationVersion(currentVersion) : 0;
  const expectedPrefix = parseMigrationVersion(expectedVersion);
  const schemaState =
    database === null
      ? 'unknown'
      : currentPrefix === expectedPrefix
        ? 'current'
        : currentPrefix > expectedPrefix
          ? 'ahead'
          : 'behind';
  return {
    ready: database !== null && schemaState !== 'behind',
    currentVersion,
    expectedVersion,
    schemaState,
  };
}

export function closeDatabase(): void {
  if (!database) return;
  database.close();
  database = null;
  databasePath = null;
  migrationsDirectory = null;
}

export function getDatabasePath(): string {
  return databasePath ?? defaultDbPath(defaultDataDir());
}
