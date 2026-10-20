/** Node 22 gives SQLite's warning no code; disabling its type would hide all experimental warnings.
 * Scope the public emitWarning wrapper to one CLI command, preserving every other warning/overload.
 * Trace mode deliberately retains native output and the original emission location.
 */
export function manageCliWarnings(defer: boolean) {
  const tracing =
    process.execArgv.includes('--trace-warnings') ||
    /(?:^|\s|["'])--trace-warnings(?:$|\s|["'])/.test(process.env.NODE_OPTIONS ?? '');
  if (tracing) return () => {};
  const original = process.emitWarning;
  const pending: unknown[][] = [];
  const filtered = (...args: unknown[]) => {
    const [warning, type] = args;
    const name =
      warning instanceof Error
        ? warning.name
        : typeof type === 'string'
          ? type
          : type && typeof type === 'object' && 'type' in type
            ? type.type
            : undefined;
    const message = warning instanceof Error ? warning.message : warning;
    const code =
      warning instanceof Error && 'code' in warning
        ? warning.code
        : type && typeof type === 'object' && 'code' in type
          ? type.code
          : args[2];
    if (
      code === undefined &&
      name === 'ExperimentalWarning' &&
      message === 'SQLite is an experimental feature and might change at any time'
    )
      return;
    if (defer && (typeof warning === 'string' || warning instanceof Error))
      pending.push(
        args.map((value, index) =>
          index === 1 && value && typeof value === 'object' ? { ...value } : value,
        ),
      );
    else Reflect.apply(original, process, args);
  };
  process.emitWarning = filtered as typeof process.emitWarning;
  return () => {
    // Do not overwrite another component's later replacement.
    if (process.emitWarning === filtered) process.emitWarning = original;
    for (const args of pending) Reflect.apply(original, process, args);
  };
}
