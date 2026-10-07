import { Container, Sprite, type Renderer, type Texture } from 'pixi.js';
import {
  createRng,
  hullExtent,
  weaponFor,
  type EntityId,
  type GameEvent,
  type World,
} from '@pirate/game-core';
import type { GameAssets } from '../assets/loadGameAssets';
import { ArenaView } from './ArenaView';
import { EffectsLayer } from './EffectsLayer';
import { ShipView } from './ShipView';
import { SHIP_ROTATION_OFFSET, SHIP_SPRITE_LENGTH, shipFrame } from './theme';
import { NO_INSETS, fitViewport, type Insets, type Viewport } from './viewport';

const WAKE_INTERVAL_MS = 110;

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
  private viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };
  private lastWakeAt = 0;

  constructor(
    private readonly world: World,
    private readonly assets: GameAssets,
    renderer: Renderer,
  ) {
    this.arena = new ArenaView(world.arena, assets.tiles);
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
      this.assets.ships.textures[shipFrame(event.kind, 3)]!,
      event.x,
      event.y,
      rotation,
      scale,
    );
    this.effects.explosion(now, event.x, event.y, isPlayer ? 1.3 : 1);
    this.effects.explosion(now + 120, event.x + 10, event.y - 8, 0.7);
    this.effects.debris(now, event.x, event.y, 8);
    this.effects.shake(now, isPlayer ? 14 : event.cause === 'impact' ? 9 : 4, isPlayer ? 600 : 260);
  }

  private syncShips(alpha: number, now: number): void {
    const alive = new Set<EntityId>();
    const dropWake = now - this.lastWakeAt >= WAKE_INTERVAL_MS;
    if (dropWake) this.lastWakeAt = now;

    for (const ship of this.world.ships) {
      alive.add(ship.id);
      let view = this.shipViews.get(ship.id);
      if (!view) {
        view = new ShipView(this.assets.ships, this.assets.ui, this.world, ship);
        this.shipViews.set(ship.id, view);
        this.shipLayer.addChild(view.body);
        this.overlayLayer.addChild(view.healthBar);
      }
      view.sync(alpha, now);

      if (dropWake && ship.speed > 30) {
        const back = hullExtent(this.world.config[ship.kind].hull) * 0.8;
        this.effects.wake(
          now,
          ship.x - Math.cos(ship.angle) * back,
          ship.y - Math.sin(ship.angle) * back,
        );
      }
    }

    for (const [id, view] of this.shipViews) {
      if (!alive.has(id)) {
        view.destroy();
        this.shipViews.delete(id);
      }
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
