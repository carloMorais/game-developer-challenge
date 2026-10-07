import {
  Container,
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
}

const MAX_EFFECTS = 400;

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

  private readonly effects: Effect[] = [];
  private readonly pool: Sprite[] = [];
  private readonly dot: Texture;
  private readonly ring: Texture;
  private shakeUntil = 0;
  private shakeStart = 0;
  private shakeStrength = 0;

  constructor(
    private readonly ships: Spritesheet,
    renderer: Renderer,
    /** Seeded so effects are reproducible in visual tests. */
    private readonly random: () => number,
  ) {
    const dot = new Graphics().circle(16, 16, 16).fill(0xffffff);
    const ring = new Graphics().circle(32, 32, 28).stroke({ width: 4, color: 0xffffff });
    this.dot = renderer.generateTexture(dot);
    this.ring = renderer.generateTexture(ring);
    dot.destroy();
    ring.destroy();
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

  wake(now: number, x: number, y: number): void {
    this.spawn(this.below, this.dot, now, 900, x, y, (s, t) => {
      s.scale.set(0.35 + t * 0.6);
      s.alpha = 0.22 * (1 - t);
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
    this.below.destroy({ children: true });
    this.above.destroy({ children: true });
    this.dot.destroy(true);
    this.ring.destroy(true);
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
  ): void {
    if (this.effects.length >= MAX_EFFECTS) return;
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
    this.effects.push({ sprite, start, duration, update });
  }

  private release(sprite: Sprite): void {
    sprite.removeFromParent();
    this.pool.push(sprite);
  }
}
