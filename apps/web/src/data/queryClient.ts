import { QueryClient } from '@tanstack/react-query';
import { toApiError, type ApiError } from './apiClient';

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
  }
}

/** Transient failures (timeout, network, 5xx, 429) retry twice with backoff. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && toApiError(error).retryable;
}

export function retryDelay(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 4000);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: shouldRetry,
      retryDelay,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: shouldRetry,
      retryDelay,
    },
  },
});
