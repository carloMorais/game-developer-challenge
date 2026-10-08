import { useEffect, useState } from 'react';
import { DIFFICULTY_PRESETS } from '@pirate/game-core';
import { navigate } from '../../app/router';
import { audio } from '../../game/audio/AudioManager';
import { testMode } from '../../lib/testMode';
import type { MatchResult } from '../../store/resultStore';
import { GameButton } from '../components/GameButton';
import { Panel } from '../components/Panel';
import { END_REASON_LABEL, formatAccuracy, formatDifficulty, formatTime } from '../format';
import { gradeTone } from '../grade';
import { RegistrationStatus } from './RegistrationStatus';
import { ScreenLayout } from './ScreenLayout';

interface ResultScreenProps {
  result: MatchResult;
  onPlayAgain(): void;
}

/** When the grade stamp lands (matches the CSS animation delay). */
const STAMP_DELAY_MS = 650;
const COUNT_UP_MS = 700;

function prefersStill(): boolean {
  return testMode.enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Counts from 0 to `target`; shows the final value at once when motion is off. */
function useCountUp(target: number): number {
  const [still] = useState(prefersStill);
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (still) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, still]);
  return still ? target : value;
}

export function ResultScreen({ result, onPlayAgain }: ResultScreenProps) {
  const survived = result.endReason === 'timeUp';
  const title = survived ? 'Battle complete' : 'Your ship sank';
  const score = useCountUp(result.score);
  const { stats } = result;

  // The stamp lands with a thud; a new difficulty gets its own flourish.
  useEffect(() => {
    const stamp = window.setTimeout(
      () => audio.synth('grade_stamp', { volume: 0.8 }),
      STAMP_DELAY_MS,
    );
    const unlock = result.unlocked
      ? window.setTimeout(() => audio.synth('unlock', { volume: 0.6 }), STAMP_DELAY_MS + 450)
      : undefined;
    return () => {
      window.clearTimeout(stamp);
      window.clearTimeout(unlock);
    };
  }, [result.matchId, result.unlocked]);

  return (
    <ScreenLayout>
      <Panel labelledBy="result-title" className="result-panel">
        <h1 id="result-title" className="panel-title">
          {title}
        </h1>
        <p className="result-waters">{formatDifficulty(result.difficulty)}</p>

        <p
          className={`grade-stamp grade-stamp--${gradeTone(result.grade)}`}
          data-testid="result-grade"
        >
          <span className="sr-only">Grade </span>
          {result.grade}
        </p>

        {result.unlocked && (
          <p className="result-unlock" role="status" data-testid="result-unlock">
            New waters unlocked: <strong>{DIFFICULTY_PRESETS[result.unlocked].name}</strong>
          </p>
        )}

        {/* Report card: one line per item, the points total last. */}
        <div className="report-card-frame">
          <dl className="report-card">
            <div className="report-card__row">
              <dt>Chasers sunk</dt>
              <dd data-testid="result-kills-chaser">{stats.kills.chaser}</dd>
            </div>
            <div className="report-card__row">
              <dt>Shooters sunk</dt>
              <dd data-testid="result-kills-shooter">{stats.kills.shooter}</dd>
            </div>
            <div className="report-card__row">
              <dt>Health left</dt>
              <dd data-testid="result-health">
                {survived ? `${result.hp} / ${result.maxHp}` : '0'}
              </dd>
            </div>
            <div className="report-card__row">
              <dt>Accuracy</dt>
              <dd data-testid="result-accuracy">{formatAccuracy(stats.hits, stats.shotsFired)}</dd>
            </div>
            <div className="report-card__row">
              <dt>Time played</dt>
              <dd data-testid="result-duration">{formatTime(result.durationMs)}</dd>
            </div>
            <div className="report-card__row">
              <dt>Outcome</dt>
              <dd data-testid="result-reason">{END_REASON_LABEL[result.endReason]}</dd>
            </div>
            <div className="report-card__row report-card__row--total">
              <dt>Points</dt>
              <dd data-testid="result-score">
                <span aria-hidden="true">{score}</span>
                <span className="sr-only">{result.score}</span>
              </dd>
            </div>
          </dl>
        </div>

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
