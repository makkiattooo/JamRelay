import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTools } from '../src/mcp/tools.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = resolve(root, 'docs');
const locales = ['pl', 'de', 'fr', 'es'] as const;

type CapturedTool = {
  name: string;
  title?: string;
  description?: string;
  annotations?: Record<string, unknown>;
  inputSchema?: unknown;
};

const captured = new Map<string, CapturedTool>();
const fakeServer = {
  registerTool(name: string, config: Record<string, unknown>) {
    captured.set(name, {
      name,
      title: typeof config.title === 'string' ? config.title : undefined,
      description: typeof config.description === 'string' ? config.description : undefined,
      annotations:
        config.annotations && typeof config.annotations === 'object'
          ? (config.annotations as Record<string, unknown>)
          : undefined,
      inputSchema: config.inputSchema,
    });
    return undefined;
  },
};

registerTools(fakeServer as never, {} as never, undefined, true);

const schemaKeys = (schema: unknown): string[] => {
  if (!schema || typeof schema !== 'object') return [];
  if (!Array.isArray(schema) && Object.getPrototypeOf(schema) === Object.prototype)
    return Object.keys(schema as Record<string, unknown>);

  const candidate = schema as { shape?: unknown };
  const shape = typeof candidate.shape === 'function' ? candidate.shape() : candidate.shape;
  if (shape && typeof shape === 'object') return Object.keys(shape as Record<string, unknown>);
  return [];
};

const schemaInfo = (schema: any): { type: string; required: boolean; details: string } => {
  const def = schema?._zod?.def ?? schema?.def;
  if (!def) return { type: 'unknown', required: true, details: '' };
  const type = String(def.type ?? 'unknown');
  if (type === 'optional') {
    const inner = schemaInfo(def.innerType);
    return { ...inner, required: false };
  }
  if (type === 'default') {
    const inner = schemaInfo(def.innerType);
    let value = 'default';
    try {
      value = `default: ${JSON.stringify(def.defaultValue())}`;
    } catch {
      /* introspection only */
    }
    return {
      ...inner,
      required: false,
      details: [inner.details, value].filter(Boolean).join('; '),
    };
  }
  if (type === 'enum')
    return {
      type: 'enum',
      required: true,
      details: `values: ${Object.values(def.entries ?? {}).join(', ')}`,
    };
  if (type === 'array')
    return { type: `array<${schemaInfo(def.element).type}>`, required: true, details: '' };
  if (type === 'string' || type === 'number') {
    const checks = (def.checks ?? [])
      .map((check: any) => check?.def?.value ?? check?.value)
      .filter((x: unknown) => x !== undefined);
    return {
      type,
      required: true,
      details: checks.length ? `constraints: ${checks.join(', ')}` : '',
    };
  }
  return { type, required: true, details: '' };
};

const toolLines = [
  '---',
  'title: MCP tool reference',
  'description: Generated reference for the MCP tools registered by the server.',
  '---',
  '',
  '# MCP tool reference',
  '',
  '> **Generated file.** Do not edit this page by hand. Run `npm run docs:generate` after changing MCP tool registrations.',
  '',
  `Generated from the runtime tool registry. Current tool count: **${captured.size}**.`,
  '',
];

for (const tool of [...captured.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const args = schemaKeys(tool.inputSchema);
  const readOnly = tool.annotations?.readOnlyHint === true;
  const destructive = tool.annotations?.destructiveHint === true;
  toolLines.push(`## \`${tool.name}\``, '');
  if (tool.title && tool.title !== tool.name) toolLines.push(`**Title:** ${tool.title}`, '');
  toolLines.push(`**Type:** ${readOnly ? 'Read' : 'Write / action'}`);
  if (destructive) toolLines.push('**Destructive hint:** yes');
  toolLines.push('');
  if (tool.description) toolLines.push(tool.description, '');
  toolLines.push('**Arguments:**');
  if (args.length) {
    toolLines.push('| Argument | Type | Required | Details |', '|---|---|---:|---|');
    const shape = (tool.inputSchema as any)?.shape ?? (tool.inputSchema as any)?._zod?.def?.shape;
    for (const arg of args) {
      const info = schemaInfo(shape?.[arg]);
      toolLines.push(
        `| \`${arg}\` | ${info.type} | ${info.required ? 'yes' : 'no'} | ${info.details || '—'} |`,
      );
    }
  } else toolLines.push('- None');
  toolLines.push('');
}

await writeFile(resolve(docs, 'tools-reference.md'), `${toolLines.join('\n')}\n`);

const envText = await readFile(resolve(root, '.env.example'), 'utf8');
const envLines = envText.split(/\r?\n/);
const variables: Array<{ name: string; value: string; notes: string[]; section: string }> = [];
let comments: string[] = [];
let section = 'General';

for (const raw of envLines) {
  const line = raw.trim();
  if (!line) {
    comments = [];
    continue;
  }
  if (line.startsWith('#')) {
    const text = line.replace(/^#+\s?/, '').trim();
    if (text && !/^=+$/.test(text)) {
      if (/^(Spotify OAuth|Server|Token encryption|MCP authentication|MCP OAuth)$/i.test(text)) {
        section = text;
        comments = [];
      } else comments.push(text);
    }
    continue;
  }
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (!match) continue;
  variables.push({ name: match[1], value: match[2], notes: comments, section });
  comments = [];
}

const envDoc = [
  '---',
  'title: Environment reference',
  'description: Generated reference for variables documented in .env.example.',
  '---',
  '',
  '# Environment reference',
  '',
  '> **Generated file.** `.env.example` is the documentation source for this page. Run `npm run docs:generate` after changing it.',
  '',
];

let last = '';
for (const variable of variables) {
  if (variable.section !== last) {
    envDoc.push(`## ${variable.section}`, '');
    last = variable.section;
  }
  envDoc.push(`### \`${variable.name}\``, '');
  const sensitive = /(SECRET|TOKEN_ENCRYPTION_KEY|API_KEY)/.test(variable.name);
  envDoc.push(`- **Sensitive:** ${sensitive ? 'yes' : 'no'}`);
  envDoc.push(
    `- **Example/default in \`.env.example\`:** ${variable.value ? `\`${variable.value}\`` : '_empty_'}`,
  );
  if (variable.notes.length) envDoc.push(`- **Notes:** ${variable.notes.join(' ')}`);
  envDoc.push('');
}
await writeFile(resolve(docs, 'environment-reference.md'), `${envDoc.join('\n')}\n`);

const stubCopy = {
  pl: {
    title: 'Generowana dokumentacja techniczna',
    body: 'Ta referencja jest generowana z kodu i `.env.example`. Wersja angielska jest kanoniczna i zawsze generowana automatycznie.',
    tools: 'Otwórz aktualną referencję narzędzi',
    env: 'Otwórz aktualną referencję zmiennych środowiskowych',
  },
  de: {
    title: 'Generierte technische Dokumentation',
    body: 'Diese Referenz wird aus dem Code und aus `.env.example` erzeugt. Die englische Version ist kanonisch und wird automatisch aktualisiert.',
    tools: 'Aktuelle Tool-Referenz öffnen',
    env: 'Aktuelle Umgebungsreferenz öffnen',
  },
  fr: {
    title: 'Documentation technique générée',
    body: 'Cette référence est générée depuis le code et `.env.example`. La version anglaise est canonique et générée automatiquement.',
    tools: 'Ouvrir la référence actuelle des outils',
    env: 'Ouvrir la référence actuelle des variables',
  },
  es: {
    title: 'Documentación técnica generada',
    body: 'Esta referencia se genera desde el código y `.env.example`. La versión inglesa es canónica y se actualiza automáticamente.',
    tools: 'Abrir la referencia actual de herramientas',
    env: 'Abrir la referencia actual de variables',
  },
} as const;

for (const locale of locales) {
  const dir = resolve(docs, locale);
  await mkdir(dir, { recursive: true });
  const copy = stubCopy[locale];
  await writeFile(
    resolve(dir, 'tools-reference.md'),
    `---\ntitle: ${copy.title}\n---\n\n# ${copy.title}\n\n${copy.body}\n\n[${copy.tools}](/tools-reference)\n`,
  );
  await writeFile(
    resolve(dir, 'environment-reference.md'),
    `---\ntitle: ${copy.title}\n---\n\n# ${copy.title}\n\n${copy.body}\n\n[${copy.env}](/environment-reference)\n`,
  );
}

const digest = createHash('sha256')
  .update([...captured.keys()].sort().join('\n') + '\n' + envText)
  .digest('hex')
  .slice(0, 12);
console.log(
  `Generated docs for ${captured.size} MCP tools and ${variables.length} environment variables (${digest}).`,
);
