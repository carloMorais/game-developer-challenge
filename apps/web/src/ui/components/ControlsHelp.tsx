import { KEYBOARD_CONTROLS } from '../../game/input/keyboard';
import { UiSprite } from './UiSprite';
import type { UiFrame } from './uiSpriteStyle';

const TOUCH_CONTROLS: readonly { icon: UiFrame; action: string }[] = [
  { icon: 'icon_forward', action: 'Sail forward' },
  { icon: 'icon_turn_left', action: 'Turn left' },
  { icon: 'icon_turn_right', action: 'Turn right' },
  { icon: 'icon_fire_front', action: 'Bow cannon' },
  { icon: 'icon_fire_left', action: 'Port broadside' },
  { icon: 'icon_fire_right', action: 'Starboard broadside' },
];

/** Keyboard and touch controls, shown in the main menu. */
export function ControlsHelp({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="controls-help">
      <Heading id="controls-title" className="controls-help__title">
        How to play
      </Heading>
      <p className="controls-help__intro">
        Sink enemy ships before time runs out. Chasers ram you, Shooters fire from range. You can
        sail and fire at the same time.
      </p>
      <div className="controls-help__grid">
        <dl className="controls-help__list" aria-label="Keyboard controls">
          {KEYBOARD_CONTROLS.map(({ keys, action }) => (
            <div key={action} className="controls-help__row">
              <dt>
                {keys.map((key, i) => (
                  <span key={key}>
                    {i > 0 && <span className="controls-help__or"> / </span>}
                    <kbd>{key}</kbd>
                  </span>
                ))}
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        <dl className="controls-help__list controls-help__list--touch" aria-label="Touch controls">
          {TOUCH_CONTROLS.map(({ icon, action }) => (
            <div key={action} className="controls-help__row">
              <dt>
                <UiSprite name={icon} width={22} />
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
