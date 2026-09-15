export class ProviderApiError extends Error {
  public apiErrorId?: number;
  public readonly providerCode?: string;
  public readonly retryAfter?: number;
  public readonly scope?: string;
  public readonly capability?: string;

  constructor(
    public readonly status: number,
    message: string,
    public readonly provider: string,
    public readonly connectionId: string,
    options: {
      retryAfter?: number;
      scope?: string;
      capability?: string;
      providerCode?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ProviderApiError';
    this.retryAfter = options.retryAfter;
    this.scope = options.scope;
    this.capability = options.capability;
    this.providerCode = options.providerCode;
  }
}

export class ProviderSelectionError extends Error {
  constructor(
    message: string,
    public readonly operation: 'read' | 'write',
    public readonly candidates: string[] = [],
  ) {
    super(message);
    this.name = 'ProviderSelectionError';
  }
}

export class CapabilityUnavailableError extends Error {
  constructor(
    public readonly capability: string,
    public readonly provider?: string,
    public readonly connectionId?: string,
  ) {
    super(`Provider capability is unavailable: ${capability}`);
    this.name = 'CapabilityUnavailableError';
  }
}
