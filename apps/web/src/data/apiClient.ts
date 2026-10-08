import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE, type ApiErrorBody } from '@pirate/contracts';

/** Requests slower than this are abandoned and treated as a timeout. */
export const REQUEST_TIMEOUT_MS = 6000;

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Set on the single retry made after recovering the transport. */
    transportRetried?: boolean;
  }
}

let recoverTransport: (() => Promise<void>) | null = null;

/**
 * Registers how to bring the API back when a response did not come from it
 * (the mock worker lost track of this page). Called once, then the request is
 * retried a single time.
 */
export function setTransportRecovery(recover: (() => Promise<void>) | null): void {
  recoverTransport = recover;
}

function isJsonResponse(response: AxiosResponse): boolean {
  const type: unknown = response.headers['content-type'];
  return typeof type === 'string' && type.includes('json');
}

/**
 * A non-JSON answer means the request never reached the API (e.g. the host's
 * HTML fallback or a 405 page). Never hand that body to the UI.
 */
async function handleForeignResponse(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  if (recoverTransport && !config.transportRetried) {
    await recoverTransport();
    return apiClient.request({ ...config, transportRetried: true });
  }
  throw new ApiError('network', 'Could not reach the server.');
}

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

apiClient.interceptors.response.use(
  (response) => (isJsonResponse(response) ? response : handleForeignResponse(response.config)),
  (error: unknown) => {
    if (error instanceof AxiosError && error.response && error.config) {
      if (!isJsonResponse(error.response)) return handleForeignResponse(error.config);
    }
    throw error;
  },
);
