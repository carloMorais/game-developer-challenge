import type { ApiError } from '../../data/apiClient';
import { GameButton } from '../components/GameButton';

interface QueryStateProps {
  what: string;
  isPending: boolean;
  isFetching: boolean;
  error: ApiError | null;
  hasData: boolean;
  onRetry(): void;
}

/**
 * Loading / error / background-refresh feedback shared by both tabs. With
 * cached data, a failed refresh keeps the data and shows a warning instead.
 */
export function QueryState({
  what,
  isPending,
  isFetching,
  error,
  hasData,
  onRetry,
}: QueryStateProps) {
  if (isPending && !hasData) {
    return (
      <p className="log-state" role="status">
        <span className="spinner" aria-hidden="true" /> Loading {what}…
      </p>
    );
  }
  if (error) {
    return (
      <div
        className={`log-state log-state--error ${hasData ? 'log-state--inline' : ''}`}
        role="alert"
      >
        <p>
          {hasData
            ? `Couldn't refresh the ${what}. Showing the last results. `
            : `Couldn't load the ${what}. `}
          {error.message}
        </p>
        <GameButton size="small" variant="secondary" onClick={onRetry}>
          Try again
        </GameButton>
      </div>
    );
  }
  if (isFetching && hasData) {
    return (
      <p className="log-state log-state--refreshing" data-testid="log-refreshing">
        <span className="spinner" aria-hidden="true" /> Updating…
      </p>
    );
  }
  return null;
}
