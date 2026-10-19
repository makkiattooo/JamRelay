let draining = false;

export function beginDraining() {
  draining = true;
}

export function isDraining() {
  return draining;
}

export function resetLifecycleForTests() {
  draining = false;
}

// Track the underlying work, not the timeout race presented to an MCP client.
const operations = new Set<Promise<unknown>>();
export function trackOperation<T>(operation: Promise<T>): Promise<T> {
  operations.add(operation);
  void operation.then(
    () => operations.delete(operation),
    () => operations.delete(operation),
  );
  return operation;
}
export async function waitForOperations() {
  while (operations.size) await Promise.allSettled([...operations]);
}
