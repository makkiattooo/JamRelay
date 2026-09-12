import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { docsSourceHash } from './docs-hash.js';

const root = resolve(process.cwd());
const docsRoot = resolve(root, 'docs');
const locales = ['pl', 'de', 'fr', 'es'] as const;

const exists = async (path: string) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const walk = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  if (!(await exists(dir))) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (extname(entry.name) === '.md') out.push(full);
  }
  return out;
};

let updated = 0;
let checked = 0;

for (const locale of locales) {
  const localeRoot = resolve(docsRoot, locale);
  for (const file of await walk(localeRoot)) {
    const relative = file.slice(localeRoot.length + 1);
    const englishFile = resolve(docsRoot, relative);
    if (!(await exists(englishFile))) continue;

    const translation = await readFile(file, 'utf8');
    const match = translation.match(
      /^---[\s\S]*?^sourceHash:\s*([a-f0-9]{12,64})\s*$[\s\S]*?^---/m,
    );
    if (!match) continue;

    checked += 1;
    const english = await readFile(englishFile, 'utf8');
    const hash = docsSourceHash(english).slice(0, 12);
    if (match[1] === hash) continue;

    const next = translation.replace(/^sourceHash:\s*[a-f0-9]{12,64}\s*$/m, `sourceHash: ${hash}`);
    await writeFile(file, next, 'utf8');
    updated += 1;
  }
}

console.log(`Translation hashes synchronized: ${updated} updated, ${checked} checked.`);
