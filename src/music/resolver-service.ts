export type TrackResolutionService = {
  resolve(input: any): Promise<any>;
  rememberTrack(input: any): Promise<any>;
  resolveMany(inputs: any[], options?: { concurrency?: number }): Promise<any[]>;
  getLastBatchMetrics(): Record<string, unknown>;
};
