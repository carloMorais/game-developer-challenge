import axios, { AxiosError } from 'axios';
import { API_BASE, type ApiErrorBody } from '@pirate/contracts';

/** Requests slower than this are abandoned and treated as a timeout. */
export const REQUEST_TIMEOUT_MS = 6000;

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

export type ApiErrorKind = 'timeout' | 'network' | 'client' | 'server' | 'cancelled' | 'unknown';

/** Normalised API failure with a user-facing message. */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Worth retrying automatically (transient failures only). */
  get retryable(): boolean {
    return (
      this.kind === 'timeout' ||
      this.kind === 'network' ||
      this.kind === 'server' ||
      this.status === 429
    );
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return new ApiError('cancelled', 'Request cancelled.');
  if (error instanceof AxiosError) {
    if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
      return new ApiError('timeout', 'The server took too long to answer.');
    }
    const status = error.response?.status;
    if (!status) return new ApiError('network', 'Could not reach the server.');
    const body = error.response?.data as Partial<ApiErrorBody> | undefined;
    const code = body?.error?.code;
    if (status === 429)
      return new ApiError('client', 'Too many requests. Try again shortly.', status, code);
    if (status >= 500) return new ApiError('server', 'The server is having trouble.', status, code);
    return new ApiError(
      'client',
      body?.error?.message ?? 'The request was rejected.',
      status,
      code,
    );
  }
  return new ApiError('unknown', 'Something went wrong.');
}
