/**
 * Error codes the application can act on.
 *
 * Codes rather than message matching: a caller deciding whether to retry must
 * not depend on the wording of a vendor's error string.
 */
export const AI_ERROR_CODE = {
  /** No provider configured. Expected during the MVP, and not a fault. */
  NOT_CONFIGURED: 'AI_PROVIDER_NOT_CONFIGURED',
  UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  TIMEOUT: 'AI_PROVIDER_TIMEOUT',
  RATE_LIMITED: 'AI_PROVIDER_RATE_LIMITED',
  INVALID_REQUEST: 'AI_INVALID_REQUEST',
  INVALID_OUTPUT: 'AI_INVALID_OUTPUT',
  CONTENT_FILTERED: 'AI_CONTENT_FILTERED',
  BUDGET_EXCEEDED: 'AI_BUDGET_EXCEEDED',
  UNKNOWN: 'AI_UNKNOWN_ERROR',
} as const;

export type AIErrorCode = (typeof AI_ERROR_CODE)[keyof typeof AI_ERROR_CODE];

/**
 * A provider failure the application understands.
 *
 * `retryable` is set by the adapter that knows what the failure meant, so retry
 * policy lives in one place instead of being re-derived at every call site.
 */
export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly provider: string;
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(options: {
    code: AIErrorCode;
    message: string;
    provider: string;
    retryable?: boolean;
    statusCode?: number;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'AIProviderError';
    this.code = options.code;
    this.provider = options.provider;
    this.retryable = options.retryable ?? false;
    this.statusCode = options.statusCode;
  }

  static notConfigured(provider = 'none'): AIProviderError {
    return new AIProviderError({
      code: AI_ERROR_CODE.NOT_CONFIGURED,
      // Deliberately actionable: this is a setup state, not a malfunction.
      message:
        'No AI provider is configured. Set AI_PROVIDER and AI_MODEL to enable AI features.',
      provider,
      retryable: false,
    });
  }

  /** Safe to return to a client: carries no key, URL or vendor payload. */
  toPublicJSON(): { code: AIErrorCode; message: string; retryable: boolean } {
    return { code: this.code, message: this.message, retryable: this.retryable };
  }
}

export function isAIProviderError(error: unknown): error is AIProviderError {
  return error instanceof AIProviderError;
}
