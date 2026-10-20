import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

const run = (code: string, flags: string[] = []) =>
  spawnSync(process.execPath, [...flags, '--import', 'tsx', '--input-type=module', '-e', code], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

it('defers unrelated warnings until CLI teardown, hides only SQLite notice and preserves SQL failures', () => {
  const result = run(`
    import assert from 'node:assert/strict';
    import { manageCliWarnings } from './src/runtime/warnings.ts';
    import { openSqlite } from './src/runtime/sqlite.ts';
    const original = process.emitWarning;
    const observed = [];
    process.on('warning', (warning) => observed.push(warning.code));
    const restore = manageCliWarnings(true);
    const db = openSqlite(':memory:');
    assert.throws(() => db.exec('SELECT * FROM deliberately_missing_table'), /no such table/);
    db.close();
    process.emitWarning('Keep unrelated experimental warnings', { type: 'ExperimentalWarning', code: 'JAMRELAY_FIXTURE', detail: 'Actionable detail' });
    await new Promise(setImmediate);
    assert.deepEqual(observed, []);
    restore();
    assert.equal(process.emitWarning, original);
    await new Promise(setImmediate);
    assert.deepEqual(observed, ['JAMRELAY_FIXTURE']);
    console.log('SQL errors and warning delivery preserved');
  `);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).not.toContain('SQLite is an experimental feature');
  expect(result.stderr.match(/Keep unrelated experimental warnings/g)).toHaveLength(1);
  expect(result.stderr).toContain('Actionable detail');
  expect(result.stdout).toContain('SQL errors and warning delivery preserved');
});

it('keeps native SQLite warning diagnostics with --trace-warnings without duplicate handlers', () => {
  const baseline = run("await import('node:sqlite')", ['--trace-warnings']);
  const result = run(
    `
    import { manageCliWarnings } from './src/runtime/warnings.ts';
    import { openSqlite } from './src/runtime/sqlite.ts';
    const restore = manageCliWarnings(true);
    openSqlite(':memory:').close();
    restore();
  `,
    ['--trace-warnings'],
  );
  expect(result.status, result.stderr).toBe(0);
  const count = (output: string) =>
    (output.match(/SQLite is an experimental feature/g) ?? []).length;
  expect(count(result.stderr)).toBe(count(baseline.stderr));
  if (count(baseline.stderr)) expect(result.stderr).toContain('at ');
});
