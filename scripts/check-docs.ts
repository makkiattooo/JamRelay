import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sections, docsLocales, docsLink, localeMeta } from '../docs/.vitepress/navigation.mts';
import { docsSourceHash } from './docs-hash.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = resolve(root, 'docs');

const exists = async (path: string) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const errors: string[] = [];
const warnings: string[] = [];
const obsoleteClaims = [
  'Dynamic Client Registration is not implemented',
  'Dynamic Client Registration ist nicht implementiert',
  'Dynamic Client Registration n’est pas implémenté',
  'No se implementa Dynamic Client Registration',
  'Dynamiczna rejestracja klientów nie jest zaimplementowana',
  'JamRelay nie implementuje Dynamic Client Registration',
];

for (const locale of docsLocales) {
  for (const section of sections) {
    for (const page of section.pages) {
      const prefix = localeMeta[locale].prefix.replace(/^\//, '');
      const relative = page.path || 'index';
      const candidate = resolve(docsRoot, prefix, `${relative.replace(/\/$/, '/index')}.md`);
      if (!(await exists(candidate)))
        errors.push(`Missing navigation target: ${docsLink(locale, page.path)} -> ${candidate}`);
    }
  }
}

const walk = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.vitepress') continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (extname(entry.name) === '.md') out.push(full);
  }
  return out;
};

for (const file of await walk(docsRoot)) {
  const text = await readFile(file, 'utf8');

  for (const claim of obsoleteClaims) {
    if (text.includes(claim))
      errors.push(`Obsolete OAuth documentation claim in ${file}: ${claim}`);
  }

  const relativeToDocs = file.slice(docsRoot.length + 1).replace(/\\/g, '/');
  const localeMatch = relativeToDocs.match(/^(pl|de|fr|es)\/(.+)$/);
  const hashMatch = text.match(/^---[\s\S]*?^sourceHash:\s*([a-f0-9]{12,64})\s*$[\s\S]*?^---/m);
  if (localeMatch && hashMatch) {
    const englishFile = resolve(docsRoot, localeMatch[2]);
    if (await exists(englishFile)) {
      const english = await readFile(englishFile, 'utf8');
      const currentHash = docsSourceHash(english);
      if (!currentHash.startsWith(hashMatch[1])) {
        warnings.push(
          `Translation may be stale: ${relativeToDocs} (sourceHash ${hashMatch[1]}, current ${currentHash.slice(0, 12)})`,
        );
      }
    }
  }
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim();
    if (!target || /^(https?:|mailto:|#)/.test(target)) continue;
    if (target.includes('{{') || target.includes('}}')) continue;
    const clean = target.split('#')[0].split('?')[0];
    if (!clean) continue;
    let candidate: string;
    if (clean === '/') {
      candidate = resolve(docsRoot, 'index.md');
    } else if (clean.startsWith('/')) {
      const relative = clean.replace(/^\//, '').replace(/\/$/, '/index');
      candidate = resolve(docsRoot, relative.endsWith('.md') ? relative : `${relative}.md`);
    } else {
      const relative = clean.replace(/\/$/, '/index');
      candidate = resolve(dirname(file), relative.endsWith('.md') ? relative : `${relative}.md`);
    }
    if (!(await exists(candidate)))
      warnings.push(`Possible broken docs link in ${file}: ${target}`);
  }
}

if (warnings.length) {
  console.warn('\nDocumentation warnings:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}
if (errors.length) {
  console.error('\nDocumentation errors:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Docs structure OK. ${warnings.length} warning(s).`);
