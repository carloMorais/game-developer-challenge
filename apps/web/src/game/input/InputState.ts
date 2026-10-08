import { IDLE_INTENTS, type ShipIntents } from '@pirate/game-core';

export type GameAction =
  | 'forward'
  | 'turnLeft'
  | 'turnRight'
  | 'fireFront'
  | 'firePort'
  | 'fireStarboard';

export type InputSource = 'keyboard' | 'touch';

/**
 * Held actions per source (keyboard, touch), merged into ship intents. Each
 * source tracks what it holds so releasing a touch button never cancels a
 * key that is still down, and vice versa.
 */
export class InputState {
  private readonly held: Record<InputSource, Set<GameAction>> = {
    keyboard: new Set(),
    touch: new Set(),
  };

  press(source: InputSource, action: GameAction): void {
    this.held[source].add(action);
  }

  release(source: InputSource, action: GameAction): void {
    this.held[source].delete(action);
  }

  /** Drops every held action, e.g. on pause or focus loss. */
  clear(): void {
    this.held.keyboard.clear();
    this.held.touch.clear();
  }

  isHeld(action: GameAction): boolean {
    return this.held.keyboard.has(action) || this.held.touch.has(action);
  }

  toIntents(): ShipIntents {
    if (this.held.keyboard.size === 0 && this.held.touch.size === 0) return { ...IDLE_INTENTS };
    const left = this.isHeld('turnLeft') ? 1 : 0;
    const right = this.isHeld('turnRight') ? 1 : 0;
    return {
      throttle: this.isHeld('forward') ? 1 : 0,
      turn: right - left,
      fireFront: this.isHeld('fireFront'),
      firePort: this.isHeld('firePort'),
      fireStarboard: this.isHeld('fireStarboard'),
    };
  }
}
