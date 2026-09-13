import fs from 'node:fs';
import path from 'node:path';

const migrationsDir =
  process.env.TUNELINK_MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'db', 'migrations');
const slug = process.argv[2];

if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  throw new Error('Migration name must be a lowercase kebab-case slug, for example add-track-isrc');
}

fs.mkdirSync(migrationsDir, { recursive: true });
const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));
const prefixes = new Set<string>();
const valid = files.map((file) => {
  const match = /^(\d{4})_[a-z0-9][a-z0-9_-]*\.sql$/.exec(file);
  if (!match) throw new Error(`Invalid migration filename: ${file}`);
  if (prefixes.has(match[1])) throw new Error(`Duplicate migration numeric prefix: ${match[1]}`);
  prefixes.add(match[1]);
  return { file, number: Number(match[1]) };
});
const next = (valid.length ? Math.max(...valid.map((item) => item.number)) : 0) + 1;
if (next > 9999) throw new Error('Migration sequence is exhausted');

const filename = `${String(next).padStart(4, '0')}_${slug.replaceAll('-', '_')}.sql`;
const target = path.join(migrationsDir, filename);
if (fs.existsSync(target)) throw new Error(`Migration already exists: ${filename}`);

const content = `-- TuneLink migration: ${slug.replaceAll('-', '_')}\n-- Forward-only migration.\n-- Keep this migration backward-compatible with the previous application release.\n\n`;
fs.writeFileSync(target, content, { encoding: 'utf8', flag: 'wx' });
console.log(`Created ${path.relative(process.cwd(), target).replaceAll(path.sep, '/')}`);
