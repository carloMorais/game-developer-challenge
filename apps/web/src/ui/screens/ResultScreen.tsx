import { navigate } from '../../app/router';
import type { MatchResult } from '../../store/resultStore';
import { GameButton } from '../components/GameButton';
import { Panel } from '../components/Panel';
import { END_REASON_LABEL, formatTime } from '../format';
import { RegistrationStatus } from './RegistrationStatus';
import { ScreenLayout } from './ScreenLayout';

interface ResultScreenProps {
  result: MatchResult;
  onPlayAgain(): void;
}

export function ResultScreen({ result, onPlayAgain }: ResultScreenProps) {
  const title = result.endReason === 'timeUp' ? 'Battle complete' : 'Your ship sank';
  return (
    <ScreenLayout>
      <Panel labelledBy="result-title">
        <h1 id="result-title" className="panel-title">
          {title}
        </h1>
        <p className="result-score" data-testid="result-score">
          <span className="result-score__value">{result.score}</span>
          <span className="sr-only"> points</span>
        </p>
        <dl className="result-meta">
          <div>
            <dt>Points</dt>
            <dd>{result.score}</dd>
          </div>
          <div>
            <dt>Time played</dt>
            <dd data-testid="result-duration">{formatTime(result.durationMs)}</dd>
          </div>
          <div>
            <dt>Outcome</dt>
            <dd data-testid="result-reason">{END_REASON_LABEL[result.endReason]}</dd>
          </div>
        </dl>
        <RegistrationStatus result={result} />
        <div className="menu-actions">
          <GameButton onClick={onPlayAgain} data-autofocus>
            Play again
          </GameButton>
          <GameButton sound="ui_back" onClick={() => navigate({ name: 'menu' })}>
            Main menu
          </GameButton>
        </div>
      </Panel>
    </ScreenLayout>
  );
}
