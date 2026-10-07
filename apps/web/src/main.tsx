import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import { queryClient } from './data/queryClient';
import { flushPendingMatches, watchConnectivity } from './data/registration';
import { startMocks } from './mocks/browser';
import './styles.css';

async function bootstrap() {
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element #root not found');

  // The mock API must intercept before the first ranking/history request.
  await startMocks();

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );

  // Matches that could not be recorded earlier (failure, refresh) are retried.
  watchConnectivity();
  void flushPendingMatches();
}

void bootstrap();
