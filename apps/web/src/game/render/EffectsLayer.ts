import {
  Container,
  FillGradient,
  Graphics,
  Sprite,
  type Renderer,
  type Spritesheet,
  type Texture,
} from 'pixi.js';

interface Effect {
  sprite: Sprite;
  start: number;
  duration: number;
  /** `t` goes 0..1 over the effect's life. */
  update(sprite: Sprite, t: number): void;
  wake: boolean;
}

const MAX_EFFECTS = 900;
/** Wake foam never takes the slots reserved for combat feedback. */
const MAX_WAKE_EFFECTS = 650;

/** Where a ship's hull meets the water, in world units. */
export interface WakeSource {
  x: number;
  y: number;
  /** Heading in radians. */
  angle: number;
  /** Bow/stern distance from the centre. */
  halfLength: number;
  /** Side distance from the centre. */
  halfBeam: number;
  /** 0..1 share of the ship's top speed. */
  intensity: number;
  /** World pixels per second. */
  speed: number;
}

/** Deep-water tint for the channel behind a hull. */
const WAKE_SHADOW = 0x0b5a7a;

/** Share of the ship's speed the water beside the hull is dragged with. */
const WATER_CARRY = 0.45;
/** Seconds for dragged water to lose most of its speed. */
const WATER_DRAG_TAU = 0.5;
/**
 * A braking ship's bow wave keeps more than the ship's speed (it was being
 * pushed) and slows over SURGE_TAU seconds, so it outruns the stopping hull.
 */
const SURGE_CARRY = 1.6;
const SURGE_TAU = 0.8;
const SURGE_MS = 1400;
/** The following sea rushes past the hull a little faster than that. */
const FOLLOWING_SEA_CARRY = 1.8;
const KICK_TAU = 0.35;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/**
 * Distance (per unit of initial velocity) covered by water with exponential
 * drag, `t` (0..1) into an effect lasting `durationMs`.
 */
const carried = (t: number, durationMs: number, tau = WATER_DRAG_TAU) =>
  tau * (1 - Math.exp(-(t * durationMs) / 1000 / tau));

/**
 * Short-lived visual feedback (muzzle flashes, explosions, debris, splashes,
 * wakes, sinking wrecks) plus screen shake. Sprites are pooled; generated
 * textures are owned and destroyed with the layer. Time is the session's
 * render clock, which stops while paused.
 */
export class EffectsLayer {
  /** Under ships: wakes, splashes, wrecks. */
  readonly below = new Container();
  /** Over ships: flashes, explosions, debris, smoke. */
  readonly above = new Container();
  /** Bottom of `below`, so wake shadows never cover foam. */
  private readonly wakeShadows = new Container();

  private readonly effects: Effect[] = [];
  private readonly pool: Sprite[] = [];
  private readonly dot: Texture;
  private readonly ring: Texture;
  private readonly foam: Texture;
  private wakeCount = 0;
  private shakeUntil = 0;
  private shakeStart = 0;
  private shakeStrength = 0;

  constructor(
    private readonly ships: Spritesheet,
    renderer: Renderer,
    /** Seeded so effects are reproducible in visual tests. */
    private readonly random: () => number,
  ) {
    this.below.addChild(this.wakeShadows);
    const dot = new Graphics().circle(16, 16, 16).fill(0xffffff);
    const ring = new Graphics().circle(32, 32, 28).stroke({ width: 4, color: 0xffffff });
    const foamFill = new FillGradient({
      type: 'radial',
      colorStops: [
        { offset: 0, color: 'rgba(255,255,255,0.95)' },
        { offset: 0.45, color: 'rgba(255,255,255,0.55)' },
        { offset: 1, color: 'rgba(255,255,255,0)' },
      ],
    });
    const foam = new Graphics().circle(32, 32, 32).fill(foamFill);
    this.dot = renderer.generateTexture(dot);
    this.ring = renderer.generateTexture(ring);
    this.foam = renderer.generateTexture(foam);
    dot.destroy();
    ring.destroy();
    foam.destroy();
    foamFill.destroy();
  }

  get count(): number {
    return this.effects.length;
  }

  muzzleFlash(now: number, x: number, y: number, angle: number): void {
    this.spawn(this.above, this.tex('explosion_3'), now, 150, x, y, (s, t) => {
      s.rotation = angle;
      s.scale.set(0.28 + t * 0.2);
      s.alpha = 1 - t;
    });
    this.smoke(now, x, y, 0.5);
  }

  smoke(now: number, x: number, y: number, size: number): void {
    const dx = (this.random() - 0.5) * 10;
    const dy = (this.random() - 0.5) * 10;
    this.spawn(this.above, this.dot, now, 520, x, y, (s, t) => {
      s.tint = 0xd9d4c7;
      s.position.set(x + dx * t, y + dy * t - t * 8);
      s.scale.set(size * (0.4 + t * 0.9));
      s.alpha = 0.55 * (1 - t);
    });
  }

  explosion(now: number, x: number, y: number, size: number): void {
    const frames = ['explosion_1', 'explosion_2', 'explosion_3'] as const;
    this.spawn(this.above, this.tex(frames[0]), now, 420, x, y, (s, t) => {
      s.texture = this.tex(frames[Math.min(2, Math.floor(t * 3))]!);
      s.scale.set(size * (0.6 + t * 0.6));
      s.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    });
    for (let i = 0; i < 3; i++) this.smoke(now + i * 40, x, y, size * 1.4);
  }

  debris(now: number, x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 40 + this.random() * 70;
      const spin = (this.random() - 0.5) * 8;
      const frame = `wood_${1 + Math.floor(this.random() * 4)}`;
      this.spawn(this.above, this.tex(frame), now, 650, x, y, (s, t) => {
        const ease = 1 - (1 - t) * (1 - t);
        s.position.set(x + Math.cos(angle) * speed * ease, y + Math.sin(angle) * speed * ease);
        s.rotation = spin * t;
        s.scale.set(0.6);
        s.alpha = 1 - t * t;
      });
    }
  }

  splash(now: number, x: number, y: number): void {
    this.spawn(this.below, this.ring, now, 420, x, y, (s, t) => {
      s.scale.set(0.15 + t * 0.35);
      s.alpha = 0.8 * (1 - t);
    });
  }

  /**
   * Foam behind a moving ship. Water touching the hull is dragged along: it
   * starts with part of the ship's velocity and loses it over
   * {@link WATER_DRAG_TAU}. While cruising the ship outruns it, so two streaks
   * peel off the stern quarters and open into a V; a churned line follows the
   * keel over a darker channel. Faster ships leave brighter, wider wakes.
   */
  wake(now: number, src: WakeSource): void {
    const { x, y, angle, halfLength, halfBeam, intensity, speed } = src;
    const hx = Math.cos(angle);
    const hy = Math.sin(angle);
    const sternX = x - hx * halfLength * 0.8;
    const sternY = y - hy * halfLength * 0.8;
    const carry = speed * WATER_CARRY;
    const cx = hx * carry;
    const cy = hy * carry;

    // Displaced, darker water under the foam: gives white spray contrast on the
    // bright sea and reads as the channel the hull carved.
    this.spawnWake(this.wakeShadows, this.foam, now, 1300, sternX, sternY, (s, t) => {
      const drift = carried(t, 1300);
      s.position.set(sternX + cx * drift, sternY + cy * drift);
      s.tint = WAKE_SHADOW;
      s.rotation = angle;
      s.scale.set(0.9 + t * 0.5, (0.45 + t * 0.6) * (halfBeam / 20));
      s.alpha = 0.22 * intensity * (1 - t);
    });

    for (const side of [-1, 1]) {
      // Perpendicular to the heading, towards this side of the hull.
      const nx = -hy * side;
      const ny = hx * side;
      const ox = sternX + nx * halfBeam * 0.6;
      const oy = sternY + ny * halfBeam * 0.6;
      const spread = (27 + 50 * intensity) * (0.8 + this.random() * 0.4);
      const jitter = (this.random() - 0.5) * 4;
      this.spawnWake(this.below, this.foam, now, 1500, ox, oy, (s, t) => {
        const d = spread * easeOut(t);
        const drift = carried(t, 1500);
        s.position.set(
          ox + nx * d + cx * drift - hx * jitter,
          oy + ny * d + cy * drift - hy * jitter,
        );
        s.rotation = angle;
        const grow = 0.3 + t * 0.75;
        s.scale.set(grow * 0.9, grow * 0.45);
        s.alpha = (0.5 + 0.45 * intensity) * (1 - t) * (1 - t);
      });
    }

    this.spawnWake(this.below, this.foam, now, 1100, sternX, sternY, (s, t) => {
      const drift = carried(t, 1100);
      s.position.set(sternX + cx * drift, sternY + cy * drift);
      s.rotation = angle;
      const grow = 0.35 + t * 0.5;
      s.scale.set(grow * 1.1, grow * (0.4 + 0.3 * t));
      s.alpha = (0.35 + 0.4 * intensity) * (1 - t);
    });
  }

  /** Spray pushed aside by the bow when sailing fast. */
  bowWave(now: number, src: WakeSource): void {
    const { x, y, angle, halfLength, halfBeam, intensity } = src;
    const hx = Math.cos(angle);
    const hy = Math.sin(angle);
    const bowX = x + hx * halfLength * 0.7;
    const bowY = y + hy * halfLength * 0.7;

    for (const side of [-1, 1]) {
      const nx = -hy * side;
      const ny = hx * side;
      const ox = bowX + nx * halfBeam * 0.35;
      const oy = bowY + ny * halfBeam * 0.35;
      const push = 22 + 30 * intensity;
      this.spawnWake(this.below, this.foam, now, 520, ox, oy, (s, t) => {
        const d = push * easeOut(t);
        // Swept back along the hull while pushed sideways.
        s.position.set(ox + nx * d - hx * d * 0.6, oy + ny * d - hy * d * 0.6);
        s.rotation = angle;
        s.scale.set(0.18 + t * 0.3, 0.12 + t * 0.15);
        s.alpha = 0.6 * intensity * (1 - t);
      });
    }
  }

  /**
   * Braking: the water the ship was pushing keeps going. The bow wave rolls on
   * ahead of the stem, and the following sea catches up and washes forward
   * along both sides of the hull. `strength` is 0..1.
   */
  brakeSurge(now: number, src: WakeSource, strength: number): void {
    const { x, y, angle, halfLength, halfBeam, speed } = src;
    const hx = Math.cos(angle);
    const hy = Math.sin(angle);
    const bowX = x + hx * halfLength * 0.85;
    const bowY = y + hy * halfLength * 0.85;
    const scaleY = halfBeam / 20;

    // Bow wave rolling on: a crescent across the heading.
    const push = speed * SURGE_CARRY;
    this.spawnWake(this.wakeShadows, this.foam, now, SURGE_MS, bowX, bowY, (s, t) => {
      const drift = carried(t, SURGE_MS, SURGE_TAU);
      s.position.set(bowX + hx * push * drift, bowY + hy * push * drift);
      s.tint = WAKE_SHADOW;
      s.rotation = angle;
      s.scale.set(0.35 + t * 0.3, (0.6 + t * 0.9) * scaleY);
      s.alpha = 0.28 * strength * (1 - t);
    });
    this.spawnWake(this.below, this.foam, now, SURGE_MS, bowX, bowY, (s, t) => {
      const drift = carried(t, SURGE_MS, SURGE_TAU);
      s.position.set(bowX + hx * push * drift, bowY + hy * push * drift);
      s.rotation = angle;
      s.scale.set(0.18 + t * 0.22, (0.5 + t * 0.9) * scaleY);
      s.alpha = 0.8 * strength * (1 - t);
    });

    // Following sea: overtakes the slowing hull along each side.
    for (const side of [-1, 1]) {
      const nx = -hy * side;
      const ny = hx * side;
      const ox = x - hx * halfLength * 0.9 + nx * halfBeam * 1.1;
      const oy = y - hy * halfLength * 0.9 + ny * halfBeam * 1.1;
      const rush = speed * FOLLOWING_SEA_CARRY * (0.9 + this.random() * 0.2);
      const spread = 10 + this.random() * 10;
      this.spawnWake(this.below, this.foam, now, SURGE_MS, ox, oy, (s, t) => {
        const drift = carried(t, SURGE_MS, SURGE_TAU);
        const d = spread * easeOut(t);
        s.position.set(ox + hx * rush * drift + nx * d, oy + hy * rush * drift + ny * d);
        s.rotation = angle;
        const grow = 0.25 + t * 0.55;
        s.scale.set(grow * 1.2, grow * 0.5);
        s.alpha = 0.7 * strength * (1 - t) ** 1.5;
      });
    }
  }

  /**
   * The ship has just come to rest: the water it dragged along swings back
   * past the stern, and a hull-shaped ring spreads out as the sea settles.
   */
  settle(now: number, src: WakeSource, strength: number): void {
    const { x, y, angle, halfLength, halfBeam } = src;
    const hx = Math.cos(angle);
    const hy = Math.sin(angle);
    const ringX = halfLength / 30;
    const ringY = halfBeam / 30;

    for (let i = 0; i < 2; i++) {
      const delay = i * 220;
      this.spawnWake(this.below, this.ring, now + delay, 1400, x, y, (s, t) => {
        s.rotation = angle;
        const grow = 1 + easeOut(t) * (0.8 + i * 0.4);
        s.scale.set(ringX * grow, ringY * grow * 1.3);
        s.alpha = 0.45 * strength * (1 - t);
      });
    }

    // Backwash: water that was carried forward drains back along the sides.
    for (const side of [-1, 1]) {
      const nx = -hy * side;
      const ny = hx * side;
      const ox = x + hx * halfLength * 0.2 + nx * halfBeam * 0.9;
      const oy = y + hy * halfLength * 0.2 + ny * halfBeam * 0.9;
      const back = 60 + this.random() * 20;
      this.spawnWake(this.below, this.foam, now, 1000, ox, oy, (s, t) => {
        const drift = carried(t, 1000, KICK_TAU);
        s.position.set(ox - hx * back * drift + nx * 6 * t, oy - hy * back * drift + ny * 6 * t);
        s.rotation = angle;
        s.scale.set(0.3 + t * 0.4, 0.18 + t * 0.2);
        s.alpha = 0.6 * strength * Math.sin(Math.PI * Math.min(1, t * 1.4));
      });
    }
  }

  /** Pulling away from rest: the stern churns water back. `strength` is 0..1. */
  sternKick(now: number, src: WakeSource, strength: number): void {
    const { x, y, angle, halfLength, halfBeam } = src;
    const hx = Math.cos(angle);
    const hy = Math.sin(angle);
    const sternX = x - hx * halfLength * 0.85;
    const sternY = y - hy * halfLength * 0.85;

    for (let i = 0; i < 3; i++) {
      const lateral = (this.random() - 0.5) * halfBeam * 1.4;
      const ox = sternX - hy * lateral;
      const oy = sternY + hx * lateral;
      const back = 45 + 55 * strength + this.random() * 20;
      const vx = -hx * back - hy * lateral * 0.8;
      const vy = -hy * back + hx * lateral * 0.8;
      this.spawnWake(this.below, this.foam, now, 800, ox, oy, (s, t) => {
        const drift = carried(t, 800, KICK_TAU);
        s.position.set(ox + vx * drift, oy + vy * drift);
        s.scale.set(0.25 + t * 0.7);
        s.alpha = 0.5 * strength * (1 - t);
      });
    }
  }

  /** Slow ring around an idle ship, so it still sits in the water. */
  ripple(now: number, x: number, y: number, size: number): void {
    this.spawnWake(this.below, this.ring, now, 1600, x, y, (s, t) => {
      s.scale.set(size * (0.6 + easeOut(t) * 0.7));
      s.alpha = 0.18 * (1 - t);
    });
  }

  /** The destroyed ship's wreck sinks and fades out. */
  wreck(
    now: number,
    texture: Texture,
    x: number,
    y: number,
    rotation: number,
    scale: number,
  ): void {
    this.spawn(this.below, texture, now, 1800, x, y, (s, t) => {
      s.rotation = rotation + t * 0.25;
      s.scale.set(scale * (1 - t * 0.25));
      s.alpha = 1 - t;
      s.tint = 0xb8c6cc;
    });
  }

  /** A faint wisp from a reloading cannon's muzzle. */
  reloadSmoke(now: number, x: number, y: number): void {
    const dx = (this.random() - 0.5) * 6;
    const dy = (this.random() - 0.5) * 6;
    this.spawn(this.above, this.dot, now, 700, x, y, (s, t) => {
      s.tint = 0xcfc9bc;
      s.position.set(x + dx * t, y + dy * t - t * 6);
      s.scale.set(0.12 + t * 0.22);
      s.alpha = 0.28 * (1 - t);
    });
  }

  /** A survivor of a sunk ship, bobbing in the water before fading away. */
  castaway(now: number, texture: Texture, x: number, y: number, rotation: number): void {
    const drift = (this.random() - 0.5) * 12;
    const phase = this.random() * Math.PI * 2;
    this.spawn(this.below, texture, now, 6500, x, y, (s, t) => {
      const bob = Math.sin(phase + t * 26);
      s.position.set(x + drift * t, y + drift * 0.5 * t + bob * 0.8);
      s.rotation = rotation + bob * 0.12;
      s.scale.set(0.85 + bob * 0.03);
      // Pops up, floats, then slips under.
      s.alpha = Math.min(1, t * 8) * (t > 0.8 ? (1 - t) / 0.2 : 1);
    });
  }

  shake(now: number, strength: number, durationMs: number): void {
    if (now + durationMs < this.shakeUntil && strength <= this.shakeStrength) return;
    this.shakeStart = now;
    this.shakeUntil = now + durationMs;
    this.shakeStrength = strength;
  }

  /** Current camera offset from screen shake, in world pixels. */
  shakeOffset(now: number): { x: number; y: number } {
    if (now >= this.shakeUntil) return { x: 0, y: 0 };
    const t = (now - this.shakeStart) / (this.shakeUntil - this.shakeStart);
    const amplitude = this.shakeStrength * (1 - t);
    return {
      x: Math.sin(now * 0.09) * amplitude,
      y: Math.cos(now * 0.113) * amplitude,
    };
  }

  update(now: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]!;
      const t = (now - effect.start) / effect.duration;
      if (t >= 1) {
        this.release(effect.sprite);
        if (effect.wake) this.wakeCount--;
        this.effects.splice(i, 1);
      } else if (t >= 0) {
        effect.sprite.visible = true;
        effect.update(effect.sprite, t);
      }
    }
  }

  destroy(): void {
    for (const effect of this.effects) effect.sprite.destroy();
    for (const sprite of this.pool) sprite.destroy();
    this.effects.length = 0;
    this.pool.length = 0;
    this.wakeCount = 0;
    this.below.destroy({ children: true });
    this.above.destroy({ children: true });
    this.dot.destroy(true);
    this.ring.destroy(true);
    this.foam.destroy(true);
  }

  private tex(frame: string): Texture {
    return this.ships.textures[frame]!;
  }

  private spawn(
    parent: Container,
    texture: Texture,
    start: number,
    duration: number,
    x: number,
    y: number,
    update: Effect['update'],
    wake = false,
  ): boolean {
    if (this.effects.length >= MAX_EFFECTS) return false;
    const sprite = this.pool.pop() ?? new Sprite();
    sprite.texture = texture;
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.rotation = 0;
    sprite.scale.set(1);
    sprite.alpha = 1;
    sprite.tint = 0xffffff;
    // Delayed effects stay hidden until they start.
    sprite.visible = false;
    parent.addChild(sprite);
    this.effects.push({ sprite, start, duration, update, wake });
    return true;
  }

  private spawnWake(
    parent: Container,
    texture: Texture,
    start: number,
    duration: number,
    x: number,
    y: number,
    update: Effect['update'],
  ): void {
    if (this.wakeCount >= MAX_WAKE_EFFECTS) return;
    if (this.spawn(parent, texture, start, duration, x, y, update, true)) this.wakeCount++;
  }

  private release(sprite: Sprite): void {
    sprite.removeFromParent();
    this.pool.push(sprite);
  }
}
