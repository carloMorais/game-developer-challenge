import { useRef, type KeyboardEvent } from 'react';
import { navigate, type LogTab } from '../../app/router';
import { audio } from '../../game/audio/AudioManager';
import { GameButton } from '../components/GameButton';
import { Panel } from '../components/Panel';
import { ScreenLayout } from './ScreenLayout';

const TABS: readonly { id: LogTab; label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match history' },
];

/** Ranking and match history, as an ARIA tabs widget (arrow keys, Home/End). */
export function CaptainsLogScreen({ tab }: { tab: LogTab }) {
  const tabRefs = useRef<Partial<Record<LogTab, HTMLButtonElement | null>>>({});

  const select = (next: LogTab, focus: boolean) => {
    if (next !== tab) audio.play('ui_click', { volume: 0.5 });
    navigate({ name: 'log', tab: next }, { replace: true });
    if (focus) tabRefs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((t) => t.id === tab);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    select(TABS[next]!.id, true);
  };

  return (
    <ScreenLayout>
      <Panel wide labelledBy="log-title">
        <h1 id="log-title" className="panel-title">
          Captain&apos;s log
        </h1>
        <div className="tabs" role="tablist" aria-label="Captain's log" onKeyDown={onKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={`game-btn game-btn--small ${tab === t.id ? 'game-btn--primary' : 'game-btn--secondary'}`}
              onClick={() => select(t.id, false)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {TABS.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={`panel-${t.id}`}
            aria-labelledby={`tab-${t.id}`}
            hidden={tab !== t.id}
            tabIndex={0}
            className="log-panel"
          >
            {tab === t.id && <p className="log-panel__empty">No battles recorded yet.</p>}
          </div>
        ))}
        <div className="menu-actions">
          <GameButton sound="ui_back" onClick={() => navigate({ name: 'menu' })}>
            Main menu
          </GameButton>
        </div>
      </Panel>
    </ScreenLayout>
  );
}
