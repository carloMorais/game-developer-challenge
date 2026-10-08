import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import { queryClient } from './data/queryClient';
import { flushPendingMatches, registerMatch, watchConnectivity } from './data/registration';
import { testMode } from './lib/testMode';
import { startMocks } from './mocks/browser';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import './styles.css';

declare global {
  interface Window {
    /** Test-only access to the data layer (`?test=1`). */
    __pirateData?: { registerMatch: typeof registerMatch };
  }
}

async function bootstrap() {
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element #root not found');

  // The mock API must intercept before the first ranking/history request.
  await startMocks();

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </QueryClientProvider>
    </StrictMode>,
  );

  if (testMode.enabled) window.__pirateData = { registerMatch };

  // Matches that could not be recorded earlier (failure, refresh) are retried.
  watchConnectivity();
  void flushPendingMatches();
}

void bootstrap();
