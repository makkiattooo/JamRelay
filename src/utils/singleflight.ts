export class Singleflight {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  do<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const current = operation();
    this.inFlight.set(key, current);
    const cleanup = () => {
      if (this.inFlight.get(key) === current) this.inFlight.delete(key);
    };
    void current.then(cleanup, cleanup);
    return current;
  }
}
