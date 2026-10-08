import { setupWorker, type SetupWorker } from 'msw/browser';
import { setTransportRecovery } from '../data/apiClient';
import { db } from './db';
import { handlers } from './handlers';
import { network, type MockNetworkConfig, type ScenarioId } from './scenarios';

/** Control surface for tests and the in-app network panel. */
export interface MockControls {
  getConfig(): MockNetworkConfig;
  setScenario(scenario: ScenarioId): void;
  setLatency(latencyMs: number | null): void;
  /** Restores fixtures and the default scenario. */
  reset(): void;
  recordCount(): number;
}

export const mockControls: MockControls = {
  getConfig: () => network.get(),
  setScenario: (scenario) => network.update({ scenario }),
  setLatency: (latencyMs) => network.update({ latencyMs }),
  reset: () => {
    db.reset();
    network.reset();
  },
  recordCount: () => db.all().length,
};

declare global {
  interface Window {
    __pirateMocks?: MockControls;
  }
}

/**
 * MSW refreshes an existing worker registration with a fire-and-forget
 * `registration.update()`. When that background check fails (flaky network,
 * or a reload interrupting it) the rejection goes unhandled, although the
 * current worker keeps serving. Mark those promises as handled.
 */
function tolerateWorkerUpdateFailures(): void {
  if (typeof ServiceWorkerRegistration === 'undefined') return;
  const proto = ServiceWorkerRegistration.prototype;
  const update = proto.update;
  proto.update = function (this: ServiceWorkerRegistration) {
    const result = update.call(this);
    result.catch((error: unknown) => {
      console.warn('Mock worker update check failed; the current worker keeps running.', error);
    });
    return result;
  };
}

const startOptions = () =>
  ({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    onUnhandledFrame: 'bypass',
    quiet: true,
  }) as const;

let restarting: Promise<void> | null = null;

/**
 * The browser may terminate an idle service worker (e.g. while the tab is in
 * the background). MSW keeps the list of mocked pages in the worker's memory,
 * so afterwards this page's requests pass through to the real host (405 or
 * the index.html fallback). Re-running the handshake makes it mock us again.
 */
function restartMocks(worker: SetupWorker): Promise<void> {
  restarting ??= (async () => {
    try {
      await worker.stop();
      await worker.start(startOptions());
    } catch (error) {
      console.warn('Could not restart the mock API.', error);
    } finally {
      restarting = null;
    }
  })();
  return restarting;
}

/**
 * Starts the mock API in the browser. Runs in development, tests and the
 * published build (the demo has no real backend). If service workers are
 * unavailable, the app still runs and ranking/history show their error state.
 */
export async function startMocks(): Promise<void> {
  window.__pirateMocks = mockControls;
  tolerateWorkerUpdateFailures();
  try {
    const worker = setupWorker(...handlers);
    await worker.start(startOptions());
    setTransportRecovery(() => restartMocks(worker));
  } catch (error) {
    console.warn('Mock API unavailable; ranking and history will be offline.', error);
  }
}
