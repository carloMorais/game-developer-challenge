import { navigate } from '../../app/router';
import { enterBattleFullscreen } from '../../lib/fullscreen';
import { GameButton } from '../components/GameButton';
import { Panel } from '../components/Panel';
import { ScreenLayout } from './ScreenLayout';

export function MenuScreen() {
  return (
    <ScreenLayout>
      <div className="menu-layout">
        <Panel labelledBy="menu-title" className="menu-panel">
          <h1 id="menu-title" className="menu-title">
            <img
              src={`${import.meta.env.BASE_URL}game/ui/1x/title_pirate_battle.webp`}
              srcSet={`${import.meta.env.BASE_URL}game/ui/1x/title_pirate_battle.webp 1x, ${import.meta.env.BASE_URL}game/ui/2x/title_pirate_battle.webp 2x`}
              alt="Pirate Battle"
              width={384}
              height={128}
              fetchPriority="high"
            />
          </h1>
          <p className="tagline">Set sail. Take command.</p>
          <nav className="menu-actions" aria-label="Main menu">
            <GameButton
              onClick={() => {
                // Phones pick the difficulty already fullscreen and in landscape.
                enterBattleFullscreen();
                navigate({ name: 'setup' });
              }}
              data-autofocus
            >
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
      </div>
    </ScreenLayout>
  );
}
