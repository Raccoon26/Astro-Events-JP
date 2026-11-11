export type ErrorCode =
  | 'CONFIG'
  | 'BUDGET'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'SOURCE'
  | 'VALIDATION'
  | 'DELIVERY';
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly retryable: boolean,
  ) {
    super(code);
  }
}
// Raw upstream messages/URLs/headers may contain credentials. Log only this projection.
export function safeError(error: unknown): {
  code: ErrorCode | 'UNKNOWN';
  retryable: boolean;
} {
  return error instanceof AppError
    ? { code: error.code, retryable: error.retryable }
    : { code: 'UNKNOWN', retryable: false };
}
