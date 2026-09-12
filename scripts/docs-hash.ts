import { createHash } from 'node:crypto';

export const normalizeDocsSource = (text: string): string => text.replace(/\r\n?/g, '\n');

export const docsSourceHash = (text: string): string =>
  createHash('sha256').update(normalizeDocsSource(text), 'utf8').digest('hex');
