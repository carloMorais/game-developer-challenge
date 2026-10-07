import { Container, Sprite, type Spritesheet } from 'pixi.js';
import { angleDelta, hullExtent, type Ship, type World } from '@pirate/game-core';
import { HealthBar } from './HealthBar';
import {
  HEALTH_BAR,
  SHIP_ROTATION_OFFSET,
  SHIP_SPRITE_LENGTH,
  damageState,
  shipFrame,
  type DamageState,
} from './theme';

const HIT_FLASH_MS = 120;
const FIRE_FRAME_MS = 140;

/**
 * Ship visuals: hull sprite swapped by damage state, deck fire when badly
 * damaged, a hit flash, and an unrotated health bar in the overlay layer.
 */
export class ShipView {
  readonly body = new Container();
  readonly healthBar: HealthBar;
  private readonly hull: Sprite;
  private readonly fire: Sprite;
  private state: DamageState | -1 = -1;
  private flashUntil = 0;

  constructor(
    private readonly ships: Spritesheet,
    ui: Spritesheet,
    world: World,
    readonly ship: Ship,
  ) {
    this.hull = new Sprite();
    this.hull.anchor.set(0.5);
    // Scale the art so the sprite length matches the collision hull.
    const length = hullExtent(world.config[ship.kind].hull) * 2;
    this.hull.scale.set((length / SHIP_SPRITE_LENGTH) * 1.04);

    this.fire = new Sprite(ships.textures['fire_1']!);
    this.fire.anchor.set(0.5, 0.8);
    this.fire.scale.set(0.8);
    this.fire.visible = false;

    this.body.addChild(this.hull, this.fire);
    this.healthBar = new HealthBar(ui, ship.team === 'player');
  }

  /** Updates pose (interpolated by `alpha`) and visuals. */
  sync(alpha: number, nowMs: number): void {
    const s = this.ship;
    const x = s.prevX + (s.x - s.prevX) * alpha;
    const y = s.prevY + (s.y - s.prevY) * alpha;
    const angle = s.prevAngle + angleDelta(s.prevAngle, s.angle) * alpha;

    this.body.position.set(x, y);
    this.body.rotation = angle + SHIP_ROTATION_OFFSET;
    this.healthBar.position.set(x, y - HEALTH_BAR.offsetY);
    this.healthBar.setRatio(s.hp / s.maxHp);

    const state = damageState(s.hp, s.maxHp);
    if (state !== this.state) {
      this.state = state;
      this.hull.texture = this.ships.textures[shipFrame(s.kind, state)]!;
      this.fire.visible = state === 2;
    }
    if (this.fire.visible) {
      const frame = Math.floor(nowMs / FIRE_FRAME_MS) % 2 === 0 ? 'fire_1' : 'fire_2';
      this.fire.texture = this.ships.textures[frame]!;
    }

    this.hull.tint = nowMs < this.flashUntil ? 0xff8a7a : 0xffffff;
  }

  flash(nowMs: number): void {
    this.flashUntil = nowMs + HIT_FLASH_MS;
  }

  destroy(): void {
    this.body.destroy({ children: true });
    this.healthBar.destroy();
  }
}
