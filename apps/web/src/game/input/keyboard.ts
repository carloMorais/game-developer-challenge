import type { GameAction, InputState } from './InputState';

/** Physical key codes (layout-independent) mapped to game actions. */
export const KEY_BINDINGS: Readonly<Record<string, GameAction>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyA: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyD: 'turnRight',
  ArrowRight: 'turnRight',
  Space: 'fireFront',
  KeyQ: 'firePort',
  KeyE: 'fireStarboard',
};

/**
 * Captures gameplay keys on `window` only while attached (active gameplay).
 * Returns a detach function. Default browser behaviour (scrolling, button
 * activation) is suppressed only for bound keys.
 */
export function attachKeyboard(input: InputState, target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const action = KEY_BINDINGS[event.code];
    if (!action || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    input.press('keyboard', action);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const action = KEY_BINDINGS[event.code];
    if (!action) return;
    event.preventDefault();
    input.release('keyboard', action);
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
  };
}
