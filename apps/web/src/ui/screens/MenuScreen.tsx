import { navigate } from '../../app/router';
import { ControlsHelp } from '../components/ControlsHelp';
import { GameButton } from '../components/GameButton';
import { Panel } from '../components/Panel';
import { ScreenLayout } from './ScreenLayout';

export function MenuScreen({ onPlay }: { onPlay(): void }) {
  return (
    <ScreenLayout>
      <div className="menu-layout">
        <Panel labelledBy="menu-title" className="menu-panel">
          <h1 id="menu-title" className="menu-title">
            <img
              src={`${import.meta.env.BASE_URL}game/ui/1x/title_pirate_battle.png`}
              srcSet={`${import.meta.env.BASE_URL}game/ui/1x/title_pirate_battle.png 1x, ${import.meta.env.BASE_URL}game/ui/2x/title_pirate_battle.png 2x`}
              alt="Pirate Battle"
              width={384}
              height={128}
            />
          </h1>
          <p className="tagline">Set sail. Take command.</p>
          <nav className="menu-actions" aria-label="Main menu">
            <GameButton onClick={onPlay} data-autofocus>
              Play
            </GameButton>
            <GameButton onClick={() => navigate({ name: 'options' })}>Options</GameButton>
            <div className="menu-actions__row">
              <GameButton
                variant="secondary"
                size="small"
                sound="ui_open"
                onClick={() => navigate({ name: 'log', tab: 'ranking' })}
              >
                Ranking
              </GameButton>
              <GameButton
                variant="secondary"
                size="small"
                sound="ui_open"
                onClick={() => navigate({ name: 'log', tab: 'history' })}
              >
                Match history
              </GameButton>
            </div>
          </nav>
        </Panel>
        <Panel labelledBy="controls-title" className="controls-panel">
          <ControlsHelp />
        </Panel>
      </div>
    </ScreenLayout>
  );
}
