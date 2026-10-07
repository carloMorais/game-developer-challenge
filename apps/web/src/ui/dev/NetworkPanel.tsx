import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { invalidateMatchLists } from '../../data/queries';
import { useRegistrationStore } from '../../data/registration';
import { mockControls } from '../../mocks/browser';
import { SCENARIOS, network, type ScenarioId } from '../../mocks/scenarios';
import { useFocusTrap } from '../components/useFocusTrap';

const VISIBLE_KEY = 'pirate-battle:network-panel';

function initiallyVisible(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('debug')) {
      window.localStorage.setItem(VISIBLE_KEY, '1');
      return true;
    }
    return window.localStorage.getItem(VISIBLE_KEY) === '1';
  } catch {
    return false;
  }
}

const LATENCIES: readonly { label: string; value: number | null }[] = [
  { label: 'Scenario default', value: null },
  { label: 'None (0 ms)', value: 0 },
  { label: '500 ms', value: 500 },
  { label: '2 s', value: 2000 },
];

/**
 * Mock network controls for demos and manual testing: pick a scenario,
 * override latency and restore the initial state. Open with `?debug` in the
 * URL or Ctrl+Shift+M.
 */
export function NetworkPanel() {
  const [enabled, setEnabled] = useState(initiallyVisible);
  const [open, setOpen] = useState(false);
  const config = useSyncExternalStore(
    (cb) => network.subscribe(cb),
    () => network.get(),
  );
  const pendingCount = useRegistrationStore((s) => s.pending.length);
  const [notice, setNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyM') {
        event.preventDefault();
        setEnabled(true);
        setOpen((o) => !o);
      } else if (event.code === 'Escape' && open) {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  if (!enabled) return null;

  const choose = (scenario: ScenarioId) => {
    mockControls.setScenario(scenario);
    setNotice(`Scenario: ${SCENARIOS[scenario].label}`);
    void invalidateMatchLists();
  };

  return (
    <>
      <button
        type="button"
        className="network-toggle"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        Network: {SCENARIOS[config.scenario].label}
      </button>
      {open && (
        <div
          ref={dialogRef}
          className="network-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
        >
          <h2 id={titleId}>Mock network</h2>
          <fieldset>
            <legend>Scenario</legend>
            <div className="network-panel__scenarios">
              {(Object.keys(SCENARIOS) as ScenarioId[]).map((id) => (
                <label key={id} className="network-panel__option">
                  <input
                    type="radio"
                    name="mock-scenario"
                    value={id}
                    checked={config.scenario === id}
                    onChange={() => choose(id)}
                  />
                  <span>
                    <strong>{SCENARIOS[id].label}</strong>
                    <small>{SCENARIOS[id].description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="network-panel__row">
            Latency
            <select
              value={config.latencyMs === null ? '' : String(config.latencyMs)}
              onChange={(e) =>
                mockControls.setLatency(e.target.value === '' ? null : Number(e.target.value))
              }
            >
              {LATENCIES.map((l) => (
                <option key={l.label} value={l.value === null ? '' : String(l.value)}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <p className="network-panel__info">Pending registrations: {pendingCount}</p>
          <div className="network-panel__actions">
            <button
              type="button"
              onClick={() => {
                mockControls.reset();
                setNotice('Mock server restored: fixtures and the Success scenario.');
                void invalidateMatchLists();
              }}
            >
              Reset mock server
            </button>
            <button
              type="button"
              onClick={() => {
                mockControls.reset();
                try {
                  for (const key of Object.keys(window.localStorage)) {
                    if (key.startsWith('pirate-battle:') && key !== VISIBLE_KEY)
                      window.localStorage.removeItem(key);
                  }
                } catch {
                  // Storage unavailable: nothing to clear.
                }
                window.location.assign(window.location.pathname);
              }}
            >
              Reset all local data
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <p className="network-panel__notice" role="status">
            {notice}
          </p>
        </div>
      )}
    </>
  );
}
