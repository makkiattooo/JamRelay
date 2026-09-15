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
