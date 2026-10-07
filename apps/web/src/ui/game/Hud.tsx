import type { HudSnapshot } from '@pirate/game-core';
import { UiSprite } from '../components/UiSprite';
import { uiSpriteStyle } from '../components/uiSpriteStyle';
import { formatTime } from '../format';

const BAR_WIDTH = 220;
/** Fill area inside the 256-wide health frame (atlas `fill_rect`). */
const FILL = { x: 30, w: 196 };

interface HudProps {
  hud: HudSnapshot;
  onPause(): void;
}

/** Heads-up display, updated from throttled simulation snapshots. */
export function Hud({ hud, onPause }: HudProps) {
  const ratio = hud.maxHp > 0 ? hud.hp / hud.maxHp : 0;
  const fill =
    ratio > 0.6 ? 'health_fill_green' : ratio > 0.3 ? 'health_fill_amber' : 'health_fill_red';
  const k = BAR_WIDTH / 256;
  const clipWidth = (FILL.x + FILL.w * ratio) * k;

  return (
    <div className="hud">
      <div className="hud-health" data-testid="hud-health">
        <UiSprite name="icon_heart" width={36} className="hud-health__icon" />
        <div className="hud-health__bar" style={uiSpriteStyle('health_frame', BAR_WIDTH)}>
          <div className="hud-health__clip" style={{ width: clipWidth }}>
            <span style={{ display: 'block', ...uiSpriteStyle(fill, BAR_WIDTH) }} />
          </div>
          <span className="hud-health__text">
            {Math.ceil(hud.hp)} / {hud.maxHp}
          </span>
        </div>
      </div>

      <div className="hud-right">
        <div
          className="hud-counter"
          style={uiSpriteStyle('counter_panel', 128)}
          data-testid="hud-score"
        >
          <UiSprite name="icon_score" width={26} />
          <span>{hud.score}</span>
        </div>
        <div
          className="hud-counter"
          style={uiSpriteStyle('counter_panel', 128)}
          data-testid="hud-time"
        >
          <UiSprite name="icon_time" width={26} />
          <span>{formatTime(hud.remainingMs)}</span>
        </div>
        <button type="button" className="round-btn" onClick={onPause} aria-label="Pause game">
          <UiSprite name="icon_pause" width={26} />
        </button>
      </div>
    </div>
  );
}
