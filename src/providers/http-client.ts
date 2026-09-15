export type ProviderApiMetrics = { total: number; by_endpoint: Record<string, number> };

/** Minimal provider transport contract used by generic MCP/domain services. */
export interface ProviderHttpClient {
  request<T>(path: string, init?: RequestInit, retry?: boolean): Promise<T | null>;
  json<T>(path: string, body: unknown, method?: string): Promise<T | null>;
  getApiCallMetrics?: () => ProviderApiMetrics;
  getApiCallDelta?: (before: ProviderApiMetrics) => ProviderApiMetrics;
}
