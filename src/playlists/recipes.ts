import { randomUUID } from 'node:crypto';
import { getDatabase, isDatabaseInitialized } from '../db/database.js';
import type { PlaylistRule } from './rules.js';
export type PlaylistRecipe = {
  recipeId: string;
  name: string;
  description: string;
  rules: PlaylistRule[];
  operations: Record<string, unknown>;
  version: number;
  createdAt: number;
  updatedAt: number;
};
const db = () => {
  if (!isDatabaseInitialized())
    throw Object.assign(new Error('State database is required for playlist recipes.'), {
      code: 'state_database_required',
    });
  return getDatabase();
};
const decode = (row: any): PlaylistRecipe => ({
  recipeId: row.id,
  name: row.name,
  description: row.description,
  version: row.version,
  ...JSON.parse(row.payload_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
export function createRecipe(input: {
  name: string;
  description?: string;
  rules: PlaylistRule[];
  operations?: Record<string, unknown>;
}) {
  const d = db(),
    now = Date.now(),
    id = `recipe_${randomUUID()}`,
    payload = JSON.stringify({ rules: input.rules, operations: input.operations ?? {} });
  d.prepare('INSERT INTO playlist_recipes VALUES (?, ?, ?, 1, ?, ?, ?)').run(
    id,
    input.name,
    input.description ?? '',
    payload,
    now,
    now,
  );
  return getRecipe(id)!;
}
export function getRecipe(id: string) {
  const row = db().prepare('SELECT * FROM playlist_recipes WHERE id=?').get(id) as any;
  return row ? decode(row) : null;
}
export function listRecipes() {
  return (db().prepare('SELECT * FROM playlist_recipes ORDER BY name').all() as any[]).map(decode);
}
export function updateRecipe(
  id: string,
  input: {
    name?: string;
    description?: string;
    rules?: PlaylistRule[];
    operations?: Record<string, unknown>;
  },
) {
  const current = getRecipe(id);
  if (!current)
    throw Object.assign(new Error('Recipe was not found.'), { code: 'recipe_not_found' });
  const next = { ...current, ...input, version: current.version + 1, updatedAt: Date.now() },
    payload = JSON.stringify({ rules: next.rules, operations: next.operations });
  db()
    .prepare(
      'UPDATE playlist_recipes SET name=?, description=?, version=?, payload_json=?, updated_at=? WHERE id=?',
    )
    .run(next.name, next.description, next.version, payload, next.updatedAt, id);
  return getRecipe(id)!;
}
export function deleteRecipe(id: string) {
  const result = db().prepare('DELETE FROM playlist_recipes WHERE id=?').run(id);
  if (!result.changes)
    throw Object.assign(new Error('Recipe was not found.'), { code: 'recipe_not_found' });
  return { deleted: true, recipe_id: id };
}
