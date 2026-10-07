import { useRef, type PointerEvent } from 'react';
import type { GameAction } from '../../game/input/InputState';
import { UiSprite } from '../components/UiSprite';
import type { UiFrame } from '../components/uiSpriteStyle';

interface TouchControlsProps {
  onAction(action: GameAction, down: boolean): void;
}

interface ControlDef {
  action: GameAction;
  icon: UiFrame;
  label: string;
  className: string;
}

const MOVE: readonly ControlDef[] = [
  {
    action: 'turnLeft',
    icon: 'icon_turn_left',
    label: 'Turn left',
    className: 'touch-btn--turn-left',
  },
  {
    action: 'forward',
    icon: 'icon_forward',
    label: 'Sail forward',
    className: 'touch-btn--forward',
  },
  {
    action: 'turnRight',
    icon: 'icon_turn_right',
    label: 'Turn right',
    className: 'touch-btn--turn-right',
  },
];

const FIRE: readonly ControlDef[] = [
  {
    action: 'firePort',
    icon: 'icon_fire_left',
    label: 'Fire port broadside',
    className: 'touch-btn--port',
  },
  {
    action: 'fireFront',
    icon: 'icon_fire_front',
    label: 'Fire bow cannon',
    className: 'touch-btn--front',
  },
  {
    action: 'fireStarboard',
    icon: 'icon_fire_right',
    label: 'Fire starboard broadside',
    className: 'touch-btn--starboard',
  },
];

/**
 * On-screen buttons for touch devices. Each button tracks its own pointer, so
 * several can be held at once (move + turn + fire). Pointer capture keeps a
 * press alive while the finger drifts slightly off the button.
 */
export function TouchControls({ onAction }: TouchControlsProps) {
  return (
    <div className="touch-controls" data-testid="touch-controls">
      <div className="touch-cluster touch-cluster--move" role="group" aria-label="Movement">
        {MOVE.map((def) => (
          <TouchButton key={def.action} def={def} onAction={onAction} />
        ))}
      </div>
      <div className="touch-cluster touch-cluster--fire" role="group" aria-label="Cannons">
        {FIRE.map((def) => (
          <TouchButton key={def.action} def={def} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

function TouchButton({
  def,
  onAction,
}: {
  def: ControlDef;
  onAction: TouchControlsProps['onAction'];
}) {
  const pointers = useRef(new Set<number>());

  const down = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (pointers.current.size === 0) onAction(def.action, true);
    pointers.current.add(event.pointerId);
    event.currentTarget.dataset.pressed = 'true';
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer may already be gone (fast taps, synthetic events): the
      // press still counts and pointerup/cancel releases it.
    }
  };
  const up = (event: PointerEvent<HTMLButtonElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    if (pointers.current.size === 0) {
      onAction(def.action, false);
      delete event.currentTarget.dataset.pressed;
    }
  };

  return (
    <button
      type="button"
      className={`touch-btn ${def.className}`}
      aria-label={def.label}
      // Touch buttons are a pointer affordance; keyboard players use key bindings.
      tabIndex={-1}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(event) => event.preventDefault()}
    >
      <UiSprite name={def.icon} width={30} />
    </button>
  );
}
