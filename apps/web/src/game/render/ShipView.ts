import { Container, Sprite, type Spritesheet } from 'pixi.js';
import {
  angleDelta,
  hullExtent,
  weaponFor,
  type Ship,
  type WeaponSlot,
  type World,
} from '@pirate/game-core';
import type { ShipLook } from '../shipLook';
import { HealthBar } from './HealthBar';
import {
  HEALTH_BAR,
  SHIP_LAYOUT,
  SHIP_ROTATION_OFFSET,
  SHIP_SPRITE_LENGTH,
  cannonPlacement,
  damageState,
  flagFrame,
  hullFrame,
  sailFrame,
  smallSailFrame,
  type DamageState,
} from './theme';

const HIT_FLASH_MS = 120;
const FIRE_FRAME_MS = 140;

/** A hit rocks the ship: a decaying roll plus a small sideways jolt. */
const ROCK_MS = 520;
const ROCK_ANGLE = 0.06;
const ROCK_JOLT = 1.5;

/** A fired gun runs in towards the mast and runs out when loaded again. */
const RETRACT = 6;
const RUN_IN_MS = 90;
/** Share of the reload after which the gun starts running back out. */
const RUN_OUT_FROM = 0.7;
const RELOADING_ALPHA = 0.55;
/** Subtle smoke from the muzzle while reloading. */
const SMOKE_EVERY_MS = 170;
const MUZZLE = 9;

const SLOTS: readonly WeaponSlot[] = ['front', 'port', 'starboard'];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Emits a smoke puff at a world position. */
export type PuffSink = (x: number, y: number, now: number) => void;

interface Cannon {
  slot: WeaponSlot;
  sprite: Sprite;
  cooldown: number;
  progress: number;
  firedAt: number;
  nextPuffAt: number;
}

/**
 * Ship visuals, assembled from the pack's parts: hull, small and main sail,
 * cannons and the pennant on top, each swapped by damage state. Adds deck fire
 * when badly damaged, a hit flash and roll, reload feedback on the cannons and
 * an unrotated health bar in the overlay layer.
 */
export class ShipView {
  readonly body = new Container();
  readonly healthBar: HealthBar;
  /** Art-space parts, scaled to the hull; rocks on hits. */
  private readonly parts = new Container();
  private readonly hull = new Sprite();
  private readonly sail = new Sprite();
  private readonly smallSail = new Sprite();
  private readonly flag = new Sprite();
  private readonly fire: Sprite;
  private readonly cannons: Cannon[] = [];
  private readonly scale: number;
  private state: DamageState | -1 = -1;
  private flashUntil = 0;
  private hitAt = -Infinity;
  private rockSign = 1;

  constructor(
    private readonly ships: Spritesheet,
    ui: Spritesheet,
    world: World,
    readonly ship: Ship,
    private readonly look: ShipLook,
    private readonly puff: PuffSink,
  ) {
    // Scale the art so the ship length matches the collision hull.
    const length = hullExtent(world.config[ship.kind].hull) * 2;
    this.scale = (length / SHIP_SPRITE_LENGTH) * 1.04;
    this.parts.scale.set(this.scale);

    const place = (sprite: Sprite, at: { x: number; y: number }) => {
      sprite.anchor.set(0.5);
      sprite.position.set(at.x, at.y);
    };
    place(this.hull, SHIP_LAYOUT.hull);
    place(this.smallSail, SHIP_LAYOUT.smallSail);
    place(this.sail, SHIP_LAYOUT.sail);
    place(this.flag, SHIP_LAYOUT.flag);
    this.parts.addChild(this.hull);

    for (const slot of SLOTS) {
      const weapon = weaponFor(world, ship, slot);
      if (!weapon) continue;
      const at = cannonPlacement(look, slot);
      const sprite = new Sprite(ships.textures['cannon_loose']!);
      sprite.anchor.set(0.5);
      sprite.position.set(at.x, at.y);
      sprite.rotation = at.rotation;
      this.parts.addChild(sprite);
      this.cannons.push({
        slot,
        sprite,
        cooldown: weapon.cooldown,
        progress: 1,
        firedAt: -Infinity,
        nextPuffAt: 0,
      });
    }
    // Guns sit on deck: over the hull, under the sails and the pennant.
    this.parts.addChild(this.smallSail, this.sail, this.flag);

    this.fire = new Sprite(ships.textures['fire_1']!);
    this.fire.anchor.set(0.5, 0.8);
    this.fire.scale.set(0.8 / this.scale);
    this.fire.visible = false;
    this.parts.addChild(this.fire);

    this.body.addChild(this.parts);
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
    if (state !== this.state) this.applyState(state);
    if (this.fire.visible) {
      const frame = Math.floor(nowMs / FIRE_FRAME_MS) % 2 === 0 ? 'fire_1' : 'fire_2';
      this.fire.texture = this.ships.textures[frame]!;
    }

    this.parts.tint = nowMs < this.flashUntil ? 0xff8a7a : 0xffffff;
    this.rock(nowMs);
    this.syncCannons(nowMs);
  }

  flash(nowMs: number): void {
    this.flashUntil = nowMs + HIT_FLASH_MS;
    this.hitAt = nowMs;
    this.rockSign = -this.rockSign;
  }

  destroy(): void {
    this.body.destroy({ children: true });
    this.healthBar.destroy();
  }

  private applyState(state: DamageState): void {
    this.state = state;
    const tex = this.ships.textures;
    this.hull.texture = tex[hullFrame(this.look, state)]!;
    this.sail.texture = tex[sailFrame(this.look, state)]!;
    this.flag.texture = tex[flagFrame(this.look, state)]!;
    const small = smallSailFrame(this.look, state);
    this.smallSail.visible = small !== null;
    if (small) this.smallSail.texture = tex[small]!;
    this.fire.visible = state === 2;
  }

  /** Decaying roll and jolt after a hit, in art space so the pose is untouched. */
  private rock(nowMs: number): void {
    const t = (nowMs - this.hitAt) / ROCK_MS;
    if (t < 0 || t >= 1) {
      this.parts.rotation = 0;
      this.parts.x = 0;
      return;
    }
    const decay = (1 - t) * (1 - t);
    const wave = Math.sin(t * Math.PI * 5);
    this.parts.rotation = this.rockSign * ROCK_ANGLE * decay * wave;
    this.parts.x = this.rockSign * ROCK_JOLT * decay * Math.sin(t * Math.PI * 7);
  }

  private syncCannons(nowMs: number): void {
    const s = this.ship;
    const cos = Math.cos(this.body.rotation);
    const sin = Math.sin(this.body.rotation);
    for (const cannon of this.cannons) {
      const progress = Math.min(1, Math.max(0, 1 - s.cooldowns[cannon.slot] / cannon.cooldown));
      if (progress < cannon.progress && cannon.progress >= 1) {
        cannon.firedAt = nowMs;
        cannon.nextPuffAt = nowMs + RUN_IN_MS;
      }
      cannon.progress = progress;

      // Runs in fast after the shot and back out over the end of the reload.
      const runIn = Math.min(1, (nowMs - cannon.firedAt) / RUN_IN_MS);
      const inboard = progress >= 1 ? 0 : runIn * (1 - smoothstep(RUN_OUT_FROM, 1, progress));
      const at = cannonPlacement(this.look, cannon.slot);
      const dx = Math.cos(at.rotation);
      const dy = Math.sin(at.rotation);
      cannon.sprite.position.set(at.x - dx * RETRACT * inboard, at.y - dy * RETRACT * inboard);
      cannon.sprite.alpha =
        progress >= 1 ? 1 : RELOADING_ALPHA + (1 - RELOADING_ALPHA) * (1 - inboard);

      if (progress < 1 && s.hp > 0 && nowMs >= cannon.nextPuffAt) {
        cannon.nextPuffAt = nowMs + SMOKE_EVERY_MS;
        // Muzzle in art space -> world.
        const mx = (cannon.sprite.x + dx * MUZZLE) * this.scale;
        const my = (cannon.sprite.y + dy * MUZZLE) * this.scale;
        this.puff(this.body.x + mx * cos - my * sin, this.body.y + mx * sin + my * cos, nowMs);
      }
    }
  }
}
