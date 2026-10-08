import { Container, Sprite, type Renderer, type Texture } from 'pixi.js';
import {
  angleDelta,
  createRng,
  hullExtent,
  weaponFor,
  type EntityId,
  type GameEvent,
  type Ship,
  type World,
} from '@pirate/game-core';
import type { GameAssets } from '../assets/loadGameAssets';
import { DEFAULT_PLAYER_LOOK, ENEMY_LOOKS, type ShipLook } from '../shipLook';
import { ArenaView } from './ArenaView';
import { EffectsLayer } from './EffectsLayer';
import { ShipView } from './ShipView';
import { SHIP_ROTATION_OFFSET, SHIP_SPRITE_LENGTH, shipFrame } from './theme';
import { NO_INSETS, fitViewport, type Insets, type Viewport } from './viewport';

const WAKE_INTERVAL_MS = 60;
/** Below this speed a ship only ripples; above it, it leaves a wake. */
const WAKE_MIN_SPEED = 12;
/** Bow spray needs this share of top speed. */
const BOW_WAVE_MIN_INTENSITY = 0.45;
/** Idle ships ripple once every this many wake ticks. */
const RIPPLE_EVERY = 14;
/** Castaways left by a sunk enemy (the player's ship leaves its captain). */
const MAX_ENEMY_CASTAWAYS = 3;
const CREW_FRAMES = 6;

/** Speed change (px/s²) that reads as braking or pulling away. */
const SURGE_MIN_ACCEL = 60;
/** Braking/pulling-away bursts go out every this many wake ticks. */
const SURGE_EVERY = 2;
/** Pulling away only churns the stern below this share of top speed. */
const KICK_MAX_INTENSITY = 0.6;

/**
 * Renders a simulation world. Read-only with respect to the simulation: it
 * mirrors entities into display objects and turns game events into effects.
 *
 * Layers (bottom to top): water, wakes/splashes/wrecks, islands, ships,
 * projectiles, explosions/smoke, health bars.
 */
export class WorldView {
  readonly root = new Container();
  private readonly camera = new Container();
  private readonly arena: ArenaView;
  private readonly effects: EffectsLayer;
  private readonly shipLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly overlayLayer = new Container();
  private readonly shipViews = new Map<EntityId, ShipView>();
  private readonly projectileSprites = new Map<EntityId, Sprite>();
  private readonly projectilePool: Sprite[] = [];
  private readonly cannonBall: Texture;
  /** Seeded so castaways are reproducible in visual tests. */
  private readonly random: () => number;
  private viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };
  private lastWakeAt = 0;
  private wakeTick = 0;
  /** Last sampled speed per ship, to tell braking from cruising. */
  private readonly motion = new Map<EntityId, { speed: number; at: number; peak: number }>();

  constructor(
    private readonly world: World,
    private readonly assets: GameAssets,
    renderer: Renderer,
    private readonly playerLook: ShipLook = DEFAULT_PLAYER_LOOK,
  ) {
    this.arena = new ArenaView(world.arena, assets.tiles);
    this.random = createRng(world.seed ^ 0xc4e3).next;
    this.effects = new EffectsLayer(assets.ships, renderer, createRng(world.seed ^ 0x5eed).next);
    this.cannonBall = assets.ships.textures['cannon_ball']!;

    this.camera.addChild(
      this.arena.water,
      this.effects.below,
      this.arena.islands,
      this.arena.frame,
      this.shipLayer,
      this.projectileLayer,
      this.effects.above,
      this.overlayLayer,
    );
    this.root.addChild(this.camera);
  }

  get entityCount(): number {
    return this.shipViews.size + this.projectileSprites.size + this.effects.count;
  }

  /** Fits the arena into the screen (CSS pixels). */
  resize(screenWidth: number, screenHeight: number, insets: Insets = NO_INSETS): void {
    const { width, height } = this.world.arena;
    const fit = fitViewport(
      Math.max(1, screenWidth - insets.left - insets.right),
      Math.max(1, screenHeight - insets.top - insets.bottom),
      width,
      height,
    );
    this.viewport = {
      ...fit,
      offsetX: fit.offsetX + insets.left,
      offsetY: fit.offsetY + insets.top,
    };
    const { scale, offsetX, offsetY } = this.viewport;
    this.camera.scale.set(scale);
    this.camera.position.set(offsetX, offsetY);
    this.arena.layoutWater(
      -offsetX / scale,
      -offsetY / scale,
      screenWidth / scale,
      screenHeight / scale,
    );
  }

  getViewport(): Viewport {
    return this.viewport;
  }

  /** Applies discrete simulation events as visual feedback. */
  handleEvents(events: readonly GameEvent[], now: number): void {
    for (const event of events) {
      switch (event.type) {
        case 'shotFired':
          this.onShot(event, now);
          break;
        case 'shipDamaged':
          this.shipViews.get(event.shipId)?.flash(now);
          this.effects.explosion(now, event.x, event.y, 0.35);
          this.effects.debris(now, event.x, event.y, 3);
          if (event.shipId === this.world.playerId) this.effects.shake(now, 5, 180);
          break;
        case 'shipDestroyed':
          this.onShipDestroyed(event, now);
          break;
        case 'projectileEnded':
          if (event.cause === 'expired' || event.cause === 'outOfBounds') {
            this.effects.splash(now, event.x, event.y);
          } else if (event.cause === 'island') {
            this.effects.smoke(now, event.x, event.y, 0.6);
          }
          break;
        default:
          break;
      }
    }
  }

  /** Mirrors the world into display objects. `alpha` interpolates between ticks. */
  sync(alpha: number, now: number): void {
    this.syncShips(alpha, now);
    this.syncProjectiles(alpha);
    this.effects.update(now);
    this.arena.animate(now);

    const shake = this.effects.shakeOffset(now);
    const { scale, offsetX, offsetY } = this.viewport;
    this.camera.position.set(offsetX + shake.x * scale, offsetY + shake.y * scale);
  }

  destroy(): void {
    for (const view of this.shipViews.values()) view.destroy();
    this.shipViews.clear();
    for (const sprite of this.projectileSprites.values()) sprite.destroy();
    for (const sprite of this.projectilePool) sprite.destroy();
    this.projectileSprites.clear();
    this.projectilePool.length = 0;
    this.effects.destroy();
    // Atlas textures are shared and cached across matches: keep them.
    this.root.destroy({ children: true });
  }

  private onShot(event: Extract<GameEvent, { type: 'shotFired' }>, now: number): void {
    const ship = this.world.ships.find((s) => s.id === event.shipId);
    const weapon = ship ? weaponFor(this.world, ship, event.slot) : null;
    if (!ship || !weapon || weapon.count <= 1) {
      this.effects.muzzleFlash(now, event.x, event.y, event.angle);
    } else {
      // One flash per cannon along the broadside.
      const hx = Math.cos(ship.angle);
      const hy = Math.sin(ship.angle);
      for (let i = 0; i < weapon.count; i++) {
        const along = (i - (weapon.count - 1) / 2) * weapon.spacing;
        this.effects.muzzleFlash(now, event.x + hx * along, event.y + hy * along, event.angle);
      }
    }
  }

  private onShipDestroyed(event: Extract<GameEvent, { type: 'shipDestroyed' }>, now: number): void {
    const view = this.shipViews.get(event.shipId);
    const isPlayer = event.shipId === this.world.playerId;
    const scale = (hullExtent(this.world.config[event.kind].hull) * 2 * 1.04) / SHIP_SPRITE_LENGTH;
    const rotation = view ? view.body.rotation : SHIP_ROTATION_OFFSET;
    this.effects.wreck(
      now,
      this.assets.ships.textures[shipFrame(this.lookOf(event.kind), 3)]!,
      event.x,
      event.y,
      rotation,
      scale,
    );
    this.effects.explosion(now, event.x, event.y, isPlayer ? 1.3 : 1);
    this.effects.explosion(now + 120, event.x + 10, event.y - 8, 0.7);
    this.effects.debris(now, event.x, event.y, 8);
    this.dropCastaways(
      event.x,
      event.y,
      isPlayer ? 1 : 1 + Math.floor(this.random() * MAX_ENEMY_CASTAWAYS),
      now,
    );
    this.effects.shake(now, isPlayer ? 14 : event.cause === 'impact' ? 9 : 4, isPlayer ? 600 : 260);
  }

  private lookOf(kind: Ship['kind']): ShipLook {
    return kind === 'player' ? this.playerLook : ENEMY_LOOKS[kind];
  }

  /** Crew in the water where the ship went down, surfacing just after the blast. */
  private dropCastaways(x: number, y: number, count: number, now: number): void {
    for (let i = 0; i < count; i++) {
      const frame = `crew_${1 + Math.floor(this.random() * CREW_FRAMES)}`;
      const angle = this.random() * Math.PI * 2;
      const distance = 8 + this.random() * 16;
      this.effects.castaway(
        now + 250 + i * 160,
        this.assets.ships.textures[frame]!,
        x + Math.cos(angle) * distance,
        y + Math.sin(angle) * distance,
        this.random() * Math.PI * 2,
      );
    }
  }

  private syncShips(alpha: number, now: number): void {
    const alive = new Set<EntityId>();
    const dropWake = now - this.lastWakeAt >= WAKE_INTERVAL_MS;
    if (dropWake) {
      this.lastWakeAt = now;
      this.wakeTick++;
    }

    for (const ship of this.world.ships) {
      alive.add(ship.id);
      let view = this.shipViews.get(ship.id);
      if (!view) {
        view = new ShipView(
          this.assets.ships,
          this.assets.ui,
          this.world,
          ship,
          this.lookOf(ship.kind),
          (x, y, at) => this.effects.reloadSmoke(at, x, y),
        );
        this.shipViews.set(ship.id, view);
        this.shipLayer.addChild(view.body);
        this.overlayLayer.addChild(view.healthBar);
      }
      view.sync(alpha, now);

      if (dropWake) this.dropWake(ship, alpha, now);
    }

    for (const [id, view] of this.shipViews) {
      if (!alive.has(id)) {
        view.destroy();
        this.shipViews.delete(id);
        this.motion.delete(id);
      }
    }
  }

  private dropWake(ship: Ship, alpha: number, now: number): void {
    const { hull, movement } = this.world.config[ship.kind];
    const x = ship.prevX + (ship.x - ship.prevX) * alpha;
    const y = ship.prevY + (ship.y - ship.prevY) * alpha;

    const last = this.motion.get(ship.id);
    // Peak speed of the current run, so a stop is judged by how fast it was going.
    const peak = ship.speed > WAKE_MIN_SPEED ? Math.max(last?.peak ?? 0, ship.speed) : 0;
    this.motion.set(ship.id, { speed: ship.speed, at: now, peak });
    const dt = last ? (now - last.at) / 1000 : 0;
    const accel = last && dt > 0 ? (ship.speed - last.speed) / dt : 0;
    const source = {
      x,
      y,
      angle: ship.prevAngle + angleDelta(ship.prevAngle, ship.angle) * alpha,
      halfLength: hullExtent(hull),
      halfBeam: hull.radius,
      intensity: Math.min(1, ship.speed / movement.maxSpeed),
      speed: ship.speed,
    };
    const surgeTick = (this.wakeTick + ship.id) % SURGE_EVERY === 0;

    // Pulling away: the stern kicks water back ("puxa").
    if (surgeTick && accel > SURGE_MIN_ACCEL && source.intensity < KICK_MAX_INTENSITY) {
      this.effects.sternKick(now, source, Math.min(1, accel / movement.acceleration));
    }

    if (ship.speed <= WAKE_MIN_SPEED) {
      // Just came to rest after moving: the dragged water swings back.
      if (last && last.speed > WAKE_MIN_SPEED) {
        this.effects.settle(now, source, Math.min(1, last.peak / movement.maxSpeed));
        return;
      }
      // Stagger ships so idle ripples don't pulse in sync.
      if ((this.wakeTick + ship.id * 5) % RIPPLE_EVERY === 0) {
        this.effects.ripple(now, x, y, hullExtent(hull) / 32);
      }
      return;
    }

    this.effects.wake(now, source);
    if (source.intensity >= BOW_WAVE_MIN_INTENSITY) this.effects.bowWave(now, source);
    // Braking (or ramming an island): the pushed water rolls on ("repuxa").
    if (surgeTick && accel < -SURGE_MIN_ACCEL) {
      const strength = Math.min(1, -accel / movement.deceleration) * (0.4 + 0.6 * source.intensity);
      this.effects.brakeSurge(now, source, Math.min(1, strength));
    }
  }

  private syncProjectiles(alpha: number): void {
    const alive = new Set<EntityId>();
    for (const p of this.world.projectiles) {
      alive.add(p.id);
      let sprite = this.projectileSprites.get(p.id);
      if (!sprite) {
        sprite = this.projectilePool.pop() ?? new Sprite(this.cannonBall);
        sprite.anchor.set(0.5);
        sprite.scale.set((p.radius * 2) / 10);
        this.projectileLayer.addChild(sprite);
        this.projectileSprites.set(p.id, sprite);
      }
      sprite.position.set(p.prevX + (p.x - p.prevX) * alpha, p.prevY + (p.y - p.prevY) * alpha);
    }

    for (const [id, sprite] of this.projectileSprites) {
      if (!alive.has(id)) {
        sprite.removeFromParent();
        this.projectilePool.push(sprite);
        this.projectileSprites.delete(id);
      }
    }
  }
}
