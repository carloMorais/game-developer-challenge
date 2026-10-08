import { useSettingsStore } from '../../store/settingsStore';
import { UiSprite } from './UiSprite';
import type { UiFrame } from './uiSpriteStyle';

interface KeyHint {
  key: string;
  icon: UiFrame;
  /** Read by screen readers and shown as a tooltip; the icon carries it visually. */
  action: string;
  wide?: boolean;
}

/**
 * Laid out like the keyboard: Q / W / E sit over A / D, so the cannons flank
 * the helm. Each key shows the same icon as its touch button.
 */
const KEY_ROWS: readonly (readonly (KeyHint | null)[])[] = [
  [
    { key: 'Q', icon: 'icon_fire_left', action: 'Fire port broadside (left)' },
    { key: 'W', icon: 'icon_forward', action: 'Sail forward' },
    { key: 'E', icon: 'icon_fire_right', action: 'Fire starboard broadside (right)' },
  ],
  [
    { key: 'A', icon: 'icon_turn_left', action: 'Turn left' },
    null,
    { key: 'D', icon: 'icon_turn_right', action: 'Turn right' },
  ],
  [{ key: 'Space', icon: 'icon_fire_front', action: 'Fire bow cannon', wide: true }],
];

function Key({ hint }: { hint: KeyHint }) {
  return (
    <li
      className={`key-hint ${hint.wide ? 'key-hint--wide' : ''}`}
      title={hint.action}
      data-testid={`key-${hint.key.toLowerCase()}`}
    >
      <kbd>{hint.key}</kbd>
      <UiSprite name={hint.icon} width={26} />
      <span className="sr-only">{hint.action}</span>
    </li>
  );
}

/** Collapsible How to play panel. Starts open; stays closed once the player closes it. */
export function ControlsHelp() {
  const open = useSettingsStore((s) => s.howToPlayOpen);
  const setOpen = useSettingsStore((s) => s.setHowToPlayOpen);

  return (
    <details
      className="controls-help"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next !== open) setOpen(next);
      }}
    >
      <summary className="controls-help__summary">
        <h2 id="controls-title" className="controls-help__title">
          How to play
        </h2>
        <span className="controls-help__chevron" aria-hidden="true" />
      </summary>

      <div className="controls-help__body">
        <p className="controls-help__intro">Sink enemy ships before time runs out.</p>
        <div className="key-pad" aria-label="Keyboard controls" role="group">
          {KEY_ROWS.map((row, r) => (
            <ul key={r} className="key-pad__row">
              {row.map((hint, i) =>
                hint ? (
                  <Key key={hint.key} hint={hint} />
                ) : (
                  <li key={`gap-${i}`} className="key-hint key-hint--gap" aria-hidden="true" />
                ),
              )}
            </ul>
          ))}
        </div>
        <p className="controls-help__extra">
          <span>
            <kbd>↑</kbd> <kbd>←</kbd> <kbd>→</kbd> also steer
          </span>
          <span title="Pause or resume">
            <kbd>Esc</kbd> <UiSprite name="icon_pause" width={20} />
            <span className="sr-only">Pause or resume</span>
          </span>
        </p>
        <p className="controls-help__extra">On touch screens, tap the buttons with these icons.</p>
      </div>
    </details>
  );
}
